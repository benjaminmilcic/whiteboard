import { Injectable } from '@angular/core';
import { authHeaders, KIDS_CHAT_API, type ChatLanguage } from './kids-chat-api';

/** Voices of the browser's own speech synthesis, used when edge-tts is not available. */
const BROWSER_VOICES: Record<ChatLanguage, string> = { hr: 'hr-HR', de: 'de-DE', en: 'en-US' };

/**
 * Reads text aloud with edge-tts (via the backend), falling back to the browser's own voice. Used by voice mode
 * and by the "read aloud" button below an answer. Only one text is read at a time – a new one stops the old one.
 */
@Injectable({ providedIn: 'root' })
export class SpeechPlayerService {
  /** Incremented by every speak() and stop(), so an older reading gives up. */
  private run = 0;
  private audio?: HTMLAudioElement;
  private stopPlayback?: () => void;

  /**
   * Reads `text` aloud sentence by sentence: while one sentence plays, the next one is already being
   * synthesised, so the first words come quickly even for a long story. Resolves when it has been read
   * completely or was stopped.
   */
  async speak(text: string, language: ChatLanguage): Promise<void> {
    this.stop();
    const run = this.run;
    const sentences = splitSentences(text);
    if (!sentences.length) return;

    let next = synthesize(sentences[0], language);
    for (let i = 0; i < sentences.length; i++) {
      // undefined = synthesis failed, null = nothing to say (e.g. only emojis)
      const url = await next.catch(() => undefined);
      if (i + 1 < sentences.length) next = synthesize(sentences[i + 1], language);
      if (run !== this.run) {
        if (url) URL.revokeObjectURL(url);
        break;
      }
      if (url) await this.play(url);
      // edge-tts is an unofficial service and may stop working – then the browser's own voice reads it
      else if (url === undefined) await this.speakWithBrowser(sentences[i], language);
    }
    // Wait for the prefetched sentence to settle, so no request is left dangling
    await next.then((url) => url && URL.revokeObjectURL(url)).catch(() => undefined);
  }

  stop(): void {
    this.run++;
    this.audio?.pause();
    this.stopPlayback?.();
  }

  /** Plays one clip; resolves when it has ended, failed or was stopped. */
  private play(url: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      const done = () => {
        audio.onended = audio.onerror = null;
        URL.revokeObjectURL(url);
        if (this.audio === audio) this.audio = this.stopPlayback = undefined;
        resolve();
      };
      audio.onended = audio.onerror = done;
      this.audio = audio;
      this.stopPlayback = done;
      audio.play().catch(done);
    });
  }

  /** Fallback: the browser's speech synthesis (sounds more robotic, but works without the backend's TTS). */
  private speakWithBrowser(text: string, language: ChatLanguage): Promise<void> {
    const synth = window.speechSynthesis;
    const spoken = speakable(text).trim();
    if (!synth || !spoken) return Promise.resolve();
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = BROWSER_VOICES[language];
      utterance.rate = 0.95;
      const voice = synth.getVoices().find((v) => v.lang.replace('_', '-').startsWith(language));
      if (voice) utterance.voice = voice;
      const done = () => {
        if (this.stopPlayback === done) this.stopPlayback = undefined;
        resolve();
      };
      utterance.onend = utterance.onerror = done;
      this.stopPlayback = () => {
        synth.cancel();
        done();
      };
      synth.speak(utterance);
    });
  }
}

/**
 * Common words that only (or mostly) occur in one of the chat's languages. Ambiguous ones like "i", "a", "to",
 * "in" or "da" are left out on purpose.
 */
const LANGUAGE_WORDS: Record<ChatLanguage, Set<string>> = {
  hr: words(`je su se na ti sam si smo ste što sto kako ne za od li sa ovo ono jako dobro mogu može možeš imaš ima
    bio bila biti koji koja koje kad kada gdje zašto ali ili još već samo vrlo jer pa tako mi vi oni ona
    tvoj tvoja moj moja hrvatski hrvatskom engleski engleskom njemački njemačkom znači primjer`),
  de: words(`der die das und ist ich du nicht ein eine einen es sie wir ihr zu mit auf für von den dem sich auch wie
    heißt kann sehr gut nein aber oder wenn weil dann noch schon nur mal hier dein deine mein meine
    sind bist hat haben wird deutsch englisch kroatisch beispiel`),
  en: words(`the and is you are it of that this what can my your with for very good yes do does not have has were
    would there here they we he she his her how why when which but or just about means english example`),
};

function words(list: string): Set<string> {
  return new Set(list.split(/\s+/));
}

/**
 * The language an answer is written in – Sovica answers in the language of the question, which can differ
 * from the app's language. Counts typical words and letters; `fallback` if nothing is clear.
 * Translations in between (e.g. a German answer with one Croatian word in bold) don't change the result.
 */
export function detectLanguage(text: string, fallback: ChatLanguage): ChatLanguage {
  const scores: Record<ChatLanguage, number> = { hr: 0, de: 0, en: 0 };
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    for (const language of Object.keys(scores) as ChatLanguage[]) {
      if (LANGUAGE_WORDS[language].has(word)) scores[language]++;
    }
    // Letters that only one of the languages has
    if (/[čćđ]/.test(word)) scores.hr += 0.5;
    if (/[äöüß]/.test(word)) scores.de += 0.5;
  }
  const best = (Object.keys(scores) as ChatLanguage[]).sort((a, b) => scores[b] - scores[a])[0];
  return scores[best] > 0 && scores[best] > scores[fallback] ? best : fallback;
}

/**
 * Fetches the spoken version of `text` from the backend (edge-tts). Resolves with an object URL, or null if there
 * is nothing to say; rejects if the synthesis failed.
 */
async function synthesize(text: string, language: ChatLanguage): Promise<string | null> {
  const response = await fetch(`${KIDS_CHAT_API}/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ text, language }),
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`speech failed (${response.status})`);
  return URL.createObjectURL(await response.blob());
}

/** Without emojis and Markdown symbols – the browser voice would read them out. */
function speakable(text: string): string {
  return text.replace(/\p{Extended_Pictographic}|‍|️|[*_`#]/gu, '');
}

/**
 * Splits the answer into pieces to synthesise one after the other: by lines (list items of a written answer have
 * no full stop) and sentences. Very short pieces are joined with the next one, so the voice doesn't stop after
 * every "Bravo!".
 */
function splitSentences(text: string): string[] {
  const sentences = text
    .split(/\n+/)
    .flatMap((line) => line.replace(/\s+/g, ' ').split(/(?<=[.!?…:])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  for (const sentence of sentences) {
    const last = pieces.at(-1);
    if (last !== undefined && last.length < 40) {
      // A list item has no full stop – a comma keeps the voice from running the items together
      pieces[pieces.length - 1] = `${last}${/[.!?…:,;]$/.test(last) ? '' : ','} ${sentence}`;
    } else pieces.push(sentence);
  }
  return pieces;
}
