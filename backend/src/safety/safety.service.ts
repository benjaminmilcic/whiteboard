import { Injectable, Logger } from '@nestjs/common';
import { groq, models } from '../groq.js';
import { ANSWER_POLICY, QUESTION_POLICY, SAFETY_CATEGORIES, type SafetyCategory } from './policy.js';

export interface SafetyResult {
  safe: boolean;
  category?: SafetyCategory;
}

/**
 * Checks questions and answers with gpt-oss-safeguard against the child-safety policy.
 *
 * Fails closed: if the check itself fails (rate limit, network), it throws – the chat then shows an error
 * instead of answering unchecked.
 */
@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  /** `previousAnswer` gives the classifier context for follow-ups like "and how exactly?". */
  checkQuestion(question: string, previousAnswer?: string, signal?: AbortSignal): Promise<SafetyResult> {
    const context = previousAnswer ? `Previous answer of the helper (context only):\n${previousAnswer}\n\n` : '';
    return this.classify(QUESTION_POLICY, `${context}Message of the child to review:\n${question}`, signal);
  }

  checkAnswer(answer: string, signal?: AbortSignal): Promise<SafetyResult> {
    return this.classify(ANSWER_POLICY, `Answer to review:\n${answer}`, signal);
  }

  private async classify(policy: string, content: string, signal?: AbortSignal): Promise<SafetyResult> {
    const response = await groq().chat.completions.create(
      {
        model: models.safety,
        reasoning_effort: 'low',
        // Groq counts the maximum output against the tokens-per-minute limit, so keep it small
        max_completion_tokens: 500,
        messages: [
          { role: 'system', content: policy },
          { role: 'user', content },
        ],
      },
      { signal },
    );
    const output = response.choices[0]?.message?.content ?? '';
    const result = parseResult(output);
    if (!result.safe) this.logger.log(`Blocked (${result.category}): ${content.slice(-200).replace(/\s+/g, ' ')}`);
    return result;
  }
}

/** Reads `{"violation": 0|1, "category": "..."}`; anything unreadable counts as unsafe. */
function parseResult(output: string): SafetyResult {
  const violation = /"violation"\s*:\s*"?([01])/.exec(output)?.[1];
  if (violation === '0') return { safe: true };
  const category = /"category"\s*:\s*"([^"]*)"/.exec(output)?.[1]?.toLowerCase() as SafetyCategory | undefined;
  return { safe: false, category: category && SAFETY_CATEGORIES.includes(category) ? category : 'other' };
}
