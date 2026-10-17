import { Injectable } from '@nestjs/common';
import { groq, models } from '../groq.js';
import { SafetyService } from '../safety/safety.service.js';
import type { SafetyCategory } from '../safety/policy.js';
import { declinePrompt, systemPrompt, type Language } from './prompts.js';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * One event of the answer stream. `retract` means: the answer streamed so far failed the safety check and must
 * be removed – the tokens that follow are a gentle replacement.
 */
export type ChatEvent = { token: string } | { retract: true };

/**
 * Size of the history sent to the model, in characters (≈ 3.5 characters per token). Groq's free tier allows
 * only 8,000 tokens per minute for gpt-oss-120b, so the oldest messages are left out beyond this budget.
 */
const HISTORY_CHAR_BUDGET = 12_000;

@Injectable()
export class ChatService {
  constructor(private readonly safety: SafetyService) {}

  /**
   * Answers the last user message of `history`:
   * 1. checks the question – unsuitable questions get a gentle decline instead of an answer,
   * 2. streams the answer token by token,
   * 3. checks the complete answer – if it is unsuitable after all, it is retracted and replaced by a decline.
   */
  async *streamReply(
    history: HistoryMessage[],
    language: Language,
    voice: boolean,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    const messages = trimHistory(history);
    const question = messages[messages.length - 1].content;
    const previousAnswer = messages.findLast((m) => m.role === 'assistant')?.content;

    const questionCheck = await this.safety.checkQuestion(question, previousAnswer, signal);
    if (!questionCheck.safe) {
      yield* this.decline(question, language, questionCheck.category, signal);
      return;
    }

    let answer = '';
    for await (const token of this.stream(systemPrompt(language, voice), messages, signal)) {
      answer += token;
      yield { token };
    }

    const answerCheck = await this.safety.checkAnswer(answer, signal);
    if (!answerCheck.safe) {
      yield { retract: true };
      yield* this.decline(question, language, answerCheck.category, signal);
    }
  }

  private async *decline(
    question: string,
    language: Language,
    category: SafetyCategory | undefined,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    // Only the last message: the decline should not continue whatever led up to it.
    for await (const token of this.stream(declinePrompt(language, category), [{ role: 'user', content: question }], signal)) {
      yield { token };
    }
  }

  private async *stream(system: string, messages: HistoryMessage[], signal?: AbortSignal): AsyncGenerator<string> {
    const stream = await groq().chat.completions.create(
      {
        model: models.chat,
        stream: true,
        reasoning_effort: 'low',
        messages: [{ role: 'system', content: system }, ...messages],
      },
      { signal },
    );
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) yield token;
    }
  }
}

/** The newest messages that fit into HISTORY_CHAR_BUDGET – the last (current) question is always kept. */
function trimHistory(history: HistoryMessage[]): HistoryMessage[] {
  const kept: HistoryMessage[] = [];
  let size = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    size += history[i].content.length;
    if (kept.length && size > HISTORY_CHAR_BUDGET) break;
    kept.unshift(history[i]);
  }
  // The model expects the conversation to start with a user message
  while (kept.length > 1 && kept[0].role !== 'user') kept.shift();
  return kept;
}
