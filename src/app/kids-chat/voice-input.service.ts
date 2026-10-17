import { Injectable, signal } from '@angular/core';
import { authHeaders, KIDS_CHAT_API, type ChatLanguage } from './kids-chat-api';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

/** Why voice input failed – the chat shows a matching, child-friendly text (kidsChat.errors.<reason>). */
export class VoiceError extends Error {
  constructor(readonly reason: 'mic' | 'transcription' | 'rate_limit') {
    super(reason);
  }
}

/** Records audio from the microphone (mic button) and turns it into text via the backend (Groq whisper-large-v3). */
@Injectable({ providedIn: 'root' })
export class VoiceInputService {
  readonly state = signal<VoiceState>('idle');
  /** The live microphone stream while recording – drives the waveform display. */
  readonly stream = signal<MediaStream | null>(null);

  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    if (this.state() !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new VoiceError('mic');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
      throw new VoiceError('mic');
    });
    this.chunks = [];
    this.recorder = new MediaRecorder(stream);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start();
    this.stream.set(stream);
    this.state.set('recording');
  }

  /** Stops the recording and resolves with the recognised text (empty if nothing was said). */
  async stop(): Promise<string> {
    const recorder = this.recorder;
    if (!recorder || this.state() !== 'recording') return '';

    await this.stopRecorder(recorder);

    const mimeType = recorder.mimeType || 'audio/webm';
    const audio = new Blob(this.chunks, { type: mimeType });
    if (!audio.size) {
      this.reset();
      return '';
    }

    this.state.set('transcribing');
    try {
      return (await transcribe(audio, `recording.${extensionFor(mimeType)}`)).text;
    } finally {
      this.reset();
    }
  }

  /** Stops the recording and throws the audio away. */
  async cancel(): Promise<void> {
    if (this.recorder && this.state() === 'recording') {
      await this.stopRecorder(this.recorder);
    }
    this.reset();
  }

  private async stopRecorder(recorder: MediaRecorder): Promise<void> {
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.stop();
    await stopped;
    recorder.stream.getTracks().forEach((track) => track.stop()); // turns off the mic indicator
    this.recorder = undefined;
  }

  private reset(): void {
    this.chunks = [];
    this.stream.set(null);
    this.state.set('idle');
  }
}

export interface Transcription {
  text: string;
  /** The spoken language, if it is one the chat knows. */
  language: ChatLanguage | null;
}

/** Turns audio into text via the backend (Groq whisper-large-v3). */
export async function transcribe(audio: Blob, filename: string): Promise<Transcription> {
  const form = new FormData();
  form.append('audio', audio, filename);
  const response = await fetch(`${KIDS_CHAT_API}/transcribe`, {
    method: 'POST',
    headers: await authHeaders(),
    body: form,
  }).catch(() => {
    throw new VoiceError('transcription');
  });
  if (response.status === 429) throw new VoiceError('rate_limit');
  if (!response.ok) throw new VoiceError('transcription');
  return (await response.json()) as Transcription;
}

/** Whisper infers the audio format from the file extension, so it has to match the recording. */
function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}
