import { computed, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { MicVAD } from '@ricky0123/vad-web';
import { authHeaders, chatLanguage, KIDS_CHAT_API, type ChatLanguage } from './kids-chat-api';
import { KidsChatService } from './kids-chat.service';
import { transcribe, VoiceError } from './voice-input.service';

/**
 * - `loading`: voice detection model is being loaded
 * - `listening`: waiting for her to speak
 * - `hearing`: she is speaking right now
 * - `thinking`: recognising the speech and waiting for the (checked) answer
 * - `speaking`: Sovica reads the answer aloud
 */
export type VoiceModeState = 'off' | 'loading' | 'listening' | 'hearing' | 'thinking' | 'speaking';

/** Model, worklet and ONNX runtime are copied to /vad/ by angular.json. */
const VAD_ASSETS = new URL('vad/', document.baseURI).href;

/**
 * What Whisper typically "hears" in silence or noise – subtitle credits it learned from videos.
 * Such a transcript is ignored instead of being sent as a question.
 */
const WHISPER_NOISE =
  /untertitel|thanks? (you )?for watching|subtitles? by|amara\.org|hvala (vam )?(na|što ste) (gledanju|pratili)|^\W*$/i;

/** Voices of the browser's own speech synthesis, used when edge-tts is not available. */
const BROWSER_VOICES: Record<ChatLanguage, string> = { hr: 'hr-HR', de: 'de-DE', en: 'en-US' };

/**
 * Hands-free conversation like ChatGPT's voice mode: a voice activity detector (Silero VAD, runs in the
 * browser) notices when she starts and stops talking, Whisper turns it into text, the normal chat answers
 * (including the safety checks) and the answer is read aloud with edge-tts. Then it listens again.
 *
 * The answer is only read aloud once it is complete and has passed the safety check – a streamed answer
 * could still be retracted, and something said out loud can't be taken back.
 */
@Injectable({ providedIn: 'root' })
export class VoiceModeService {
  private readonly chat = inject(KidsChatService);
  private readonly transloco = inject(TranslocoService);

  readonly state = signal<VoiceModeState>('off');
  readonly active = computed(() => this.state() !== 'off');
  /** Subtitles: what she said last and what Sovica answers. */
  readonly heard = signal('');
  readonly answer = signal('');
  /** Speech probability of the current microphone frame (0…1) – the owl's ring grows with it. */
  readonly level = signal(0);

  private vad?: MicVAD;
  /** Incremented by stop() and interrupt(), so running steps of an older turn give up. */
  private turn = 0;
  private audio?: HTMLAudioElement;
  private stopPlayback?: () => void;

  async start(): Promise<void> {
    if (this.active()) return;
    this.turn++;
    this.heard.set('');
    this.answer.set('');
    this.state.set('loading');
    try {
      // Loaded only now: the voice detector and its ONNX runtime are big, and most visits never need them
      const { MicVAD } = await loadVad();
      this.vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: VAD_ASSETS,
        onnxWASMBasePath: VAD_ASSETS,
        // Children often pause in the middle of a sentence – wait a bit before taking it as the end
        redemptionMs: 1400,
        minSpeechMs: 400,
        onSpeechStart: () => {
          if (this.state() === 'listening') this.state.set('hearing');
        },
        onVADMisfire: () => {
          if (this.state() === 'hearing') this.state.set('listening');
        },
        onSpeechEnd: (audio) => void this.onSpeechEnd(audio),
        onFrameProcessed: (probabilities) => this.level.set(probabilities.isSpeech),
      });
      await this.listen();
    } catch (err) {
      // The child sees a friendly text – the real cause is only in the console
      console.error('[kids-chat] voice mode could not start:', err);
      await this.stop();
      throw err instanceof VoiceError ? err : new VoiceError('mic');
    }
  }

  /** Ends voice mode: stops listening, speaking and a running answer, and turns the microphone off. */
  async stop(): Promise<void> {
    this.turn++;
    this.stopAudio();
    this.chat.stop();
    this.state.set('off');
    this.level.set(0);
    const vad = this.vad;
    this.vad = undefined;
    await vad?.destroy().catch(() => undefined);
  }

  /** Tapping the owl while she speaks: stop talking and listen again. */
  async interrupt(): Promise<void> {
    if (this.state() !== 'speaking') return;
    this.turn++;
    this.stopAudio();
    await this.listen();
  }

  private async listen(): Promise<void> {
    if (!this.vad) return;
    this.level.set(0);
    this.state.set('listening');
    await this.vad.start();
  }

  private async onSpeechEnd(samples: Float32Array): Promise<void> {
    const turn = this.turn;
    // The microphone is off while thinking and speaking – otherwise Sovica would hear herself
    await this.vad?.pause();
    this.level.set(0);
    this.state.set('thinking');
    const appLanguage = chatLanguage(this.transloco.getActiveLang());

    try {
      const { utils } = await loadVad();
      const wav = new Blob([utils.encodeWAV(samples, 1, 16000, 1, 16)], { type: 'audio/wav' });
      const { text, language } = await transcribe(wav, 'speech.wav');
      if (turn !== this.turn) return;
      if (WHISPER_NOISE.test(text.trim())) {
        await this.listen();
        return;
      }

      this.heard.set(text);
      this.answer.set('');
      const reply = await this.chat.send(text, { voice: true });
      if (turn !== this.turn) return;

      if (!reply || reply.error) {
        await this.say(this.transloco.translate(`kidsChat.errors.${reply?.error ?? 'failed'}`), appLanguage, turn);
      } else {
        // The answer is in the language she spoke (see the system prompt) – that also picks the voice
        await this.say(reply.content, language ?? appLanguage, turn);
      }
    } catch (err) {
      const reason = err instanceof VoiceError ? err.reason : 'transcription';
      if (turn === this.turn) await this.say(this.transloco.translate(`kidsChat.errors.${reason}`), appLanguage, turn);
    }
    if (turn === this.turn) await this.listen();
  }

  /**
   * Reads `text` aloud sentence by sentence: while one sentence plays, the next one is already being
   * synthesised, so the first words come quickly even for a long story.
   */
  private async say(text: string, language: ChatLanguage, turn: number): Promise<void> {
    this.answer.set(text);
    const sentences = splitSentences(text);
    if (!sentences.length) return;

    this.state.set('speaking');
    let next = synthesize(sentences[0], language);
    for (let i = 0; i < sentences.length; i++) {
      // undefined = synthesis failed, null = nothing to say (e.g. only emojis)
      const url = await next.catch(() => undefined);
      if (i + 1 < sentences.length) next = synthesize(sentences[i + 1], language);
      if (turn !== this.turn) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (url) await this.play(url);
      // edge-tts is an unofficial service and may stop working – then the browser's own voice reads it
      else if (url === undefined) await this.speakWithBrowser(sentences[i], language);
    }
    // Wait for the prefetched sentence to settle, so no request is left dangling
    await next.then((url) => url && URL.revokeObjectURL(url)).catch(() => undefined);
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

  private stopAudio(): void {
    this.audio?.pause();
    this.stopPlayback?.();
  }
}

type VadModule = typeof import('@ricky0123/vad-web');

/**
 * @ricky0123/vad-web is a CommonJS package: the dev server exposes its exports by name, but the optimized
 * production build only as `default` – then `MicVAD` would be undefined.
 */
async function loadVad(): Promise<VadModule> {
  const module = (await import('@ricky0123/vad-web')) as VadModule & { default?: VadModule };
  return module.MicVAD ? module : module.default!;
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
 * Splits the answer into pieces to synthesise one after the other. Very short sentences are joined with the next
 * one, so the voice doesn't stop after every "Bravo!".
 */
function splitSentences(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…:])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  for (const sentence of sentences) {
    const last = pieces.at(-1);
    if (last !== undefined && last.length < 40) pieces[pieces.length - 1] = `${last} ${sentence}`;
    else pieces.push(sentence);
  }
  return pieces;
}
