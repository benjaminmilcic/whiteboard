import { BadRequestException, Body, Controller, Logger, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimit } from '../auth/auth.guard.js';
import { ChatService, type HistoryMessage } from './chat.service.js';
import type { Language } from './prompts.js';

interface ChatRequest {
  /** The whole conversation, ending with the new question – the app keeps the chat's memory. */
  messages: HistoryMessage[];
  /** Language of the app – used when the language of the question is unclear. */
  language?: Language;
  /** Voice mode: the answer will be read aloud, so it is kept short and without Markdown. */
  voice?: boolean;
}

const LANGUAGES: Language[] = ['hr', 'de', 'en'];
/** A child's question is short – this also limits long texts pasted in for translation. */
const MAX_MESSAGE_CHARS = 4000;
const MAX_MESSAGES = 200;

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  /**
   * Streams the answer as Server-Sent Events: `data: {"token": "..."}` …,
   * possibly `data: {"retract": true}` followed by replacement tokens, then `data: [DONE]`
   * (or `data: {"error": "..."}`).
   */
  @Post('stream')
  @RateLimit(15)
  async stream(@Body() body: ChatRequest, @Res() res: Response): Promise<void> {
    const messages = validateMessages(body?.messages);
    const language = LANGUAGES.includes(body.language as Language) ? (body.language as Language) : 'hr';

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => abort.abort());

    try {
      for await (const event of this.chatService.streamReply(messages, language, body.voice === true, abort.signal)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (err) {
      if (!abort.signal.aborted) {
        this.logger.error(err);
        const status = (err as { status?: number }).status;
        res.write(`data: ${JSON.stringify({ error: status === 429 ? 'rate_limit' : 'failed' })}\n\n`);
      }
    } finally {
      res.end();
    }
  }
}

/** Only user/assistant messages with text – a client can't sneak in its own system prompt. */
function validateMessages(messages: unknown): HistoryMessage[] {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) {
    throw new BadRequestException('messages are required');
  }
  const valid = messages.every(
    (m: HistoryMessage) =>
      (m?.role === 'user' || m?.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.length <= MAX_MESSAGE_CHARS,
  );
  if (!valid) throw new BadRequestException('invalid message');
  const cleaned = (messages as HistoryMessage[])
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content);
  if (cleaned[cleaned.length - 1]?.role !== 'user') {
    throw new BadRequestException('the last message must be a user message');
  }
  return cleaned;
}
