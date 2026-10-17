import { effect, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { authHeaders, chatLanguage, KIDS_CHAT_API } from './kids-chat-api';

export type ChatError = 'failed' | 'rate_limit' | 'offline';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Set if the answer could not be completed – the text comes from the translations, not from the server. */
  error?: ChatError;
}

const STORAGE_KEY = 'kidsChat.messages';

/**
 * The conversation. The app is the chat's memory: every request sends the whole conversation, and it is kept
 * in localStorage so it is still there when the chat is opened again.
 */
@Injectable({ providedIn: 'root' })
export class KidsChatService {
  private readonly transloco = inject(TranslocoService);

  readonly messages = signal<ChatMessage[]>(loadMessages());
  readonly streaming = signal(false);

  private abortController?: AbortController;

  constructor() {
    effect(() => {
      // Not while streaming – that would write on every token
      if (this.streaming()) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages()));
      } catch {
        // storage full or blocked – the chat then only lasts until the page is closed
      }
    });
  }

  /**
   * Sends a question and streams the answer into `messages`. Resolves with the final answer once it is complete
   * and has passed the backend's safety check – voice mode only reads it aloud then.
   * `voice` asks the backend for a short answer without Markdown, made for reading aloud.
   */
  async send(text: string, options: { voice?: boolean } = {}): Promise<ChatMessage | undefined> {
    const message = text.trim();
    if (!message || this.streaming()) return undefined;

    // Failed answers are not sent along – the model would only be confused by them
    const history = [...this.messages().filter((m) => !m.error && m.content), { role: 'user' as const, content: message }];
    this.messages.update((m) => [...m, { role: 'user', content: message }, { role: 'assistant', content: '' }]);
    this.streaming.set(true);
    this.abortController = new AbortController();

    try {
      const response = await fetch(`${KIDS_CHAT_API}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          language: chatLanguage(this.transloco.getActiveLang()),
          voice: options.voice === true,
        }),
        signal: this.abortController.signal,
      }).catch((err: Error) => {
        if (err.name === 'AbortError') throw err;
        throw new ChatFailure('offline');
      });
      if (response.status === 429) throw new ChatFailure('rate_limit');
      if (!response.ok || !response.body) throw new ChatFailure('failed');
      await this.readEventStream(response.body);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return undefined;
      this.updateLast({ content: '', error: err instanceof ChatFailure ? err.reason : 'failed' });
    } finally {
      this.streaming.set(false);
      this.abortController = undefined;
    }
    return this.messages().at(-1);
  }

  stop(): void {
    this.abortController?.abort();
  }

  reset(): void {
    this.stop();
    this.messages.set([]);
  }

  /**
   * Parses the SSE stream: `data: {"token": "..."}` …, `data: {"retract": true}` (the answer so far failed the
   * safety check and is replaced by the tokens that follow), `data: {"error": "..."}`, `data: [DONE]`.
   */
  private async readEventStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const data = event.replace(/^data: /, '');
        if (data === '[DONE]') return;
        const payload = JSON.parse(data) as { token?: string; retract?: boolean; error?: string };
        if (payload.retract) this.updateLast({ content: '' });
        if (payload.token) this.appendToLast(payload.token);
        if (payload.error) throw new ChatFailure(payload.error === 'rate_limit' ? 'rate_limit' : 'failed');
      }
    }
  }

  private appendToLast(text: string): void {
    this.messages.update((messages) => {
      const last = messages[messages.length - 1];
      return [...messages.slice(0, -1), { ...last, content: last.content + text }];
    });
  }

  private updateLast(changes: Partial<ChatMessage>): void {
    this.messages.update((messages) => [...messages.slice(0, -1), { ...messages[messages.length - 1], ...changes }]);
  }
}

class ChatFailure extends Error {
  constructor(readonly reason: ChatError) {
    super(reason);
  }
}

function loadMessages(): ChatMessage[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ChatMessage[];
    // An answer that was cut off when the page was closed is left out
    return Array.isArray(stored) ? stored.filter((m) => m.content || m.error) : [];
  } catch {
    return [];
  }
}
