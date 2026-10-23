import { computed, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { MicVAD } from '@ricky0123/vad-web';
import { chatLanguage, type ChatLanguage } from './kids-chat-api';
import { KidsChatService } from './kids-chat.service';
import { detectLanguage, SpeechPlayerService } from './speech-player.service';
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
  private readonly speech = inject(SpeechPlayerService);

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
    this.speech.stop();
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
    this.speech.stop();
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
        // The answer should be in the language she spoke (see the system prompt) – checked on the answer itself,
        // since that picks the voice
        await this.say(reply.content, detectLanguage(reply.content, language ?? appLanguage), turn);
      }
    } catch (err) {
      const reason = err instanceof VoiceError ? err.reason : 'transcription';
      if (turn === this.turn) await this.say(this.transloco.translate(`kidsChat.errors.${reason}`), appLanguage, turn);
    }
    if (turn === this.turn) await this.listen();
  }

  private async say(text: string, language: ChatLanguage, turn: number): Promise<void> {
    this.answer.set(text);
    if (turn !== this.turn) return;
    this.state.set('speaking');
    await this.speech.speak(text, language);
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
