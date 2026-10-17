import { Injectable } from '@nestjs/common';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { Language } from '../chat/prompts.js';

/**
 * Neural voices of Microsoft Edge's "Read aloud" feature. The German and English voices are multilingual,
 * so they also pronounce Croatian or English words in the middle of a sentence correctly (useful for translations).
 */
const VOICES: Record<Language, string> = {
  hr: 'hr-HR-GabrijelaNeural',
  de: 'de-DE-SeraphinaMultilingualNeural',
  en: 'en-US-AvaMultilingualNeural',
};

/** A little slower than normal – easier to follow for a child. */
const RATE = '-8%';

/**
 * Text-to-speech via edge-tts (msedge-tts): free and without an account, but an unofficial use of the Edge
 * read-aloud service – Microsoft can change or block it at any time.
 */
@Injectable()
export class SpeechService {
  async synthesize(text: string, language: Language): Promise<Buffer> {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(VOICES[language], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(speakable(text)), { rate: RATE });
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks);
    } finally {
      tts.close();
    }
  }
}

/** Removes what should not be read out: emojis, Markdown symbols, links. */
export function speakable(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\p{Extended_Pictographic}|‍|️/gu, '')
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.)\s+/gm, '') // headings and list markers
    .replace(/[*_`~>|]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** The text is placed inside SSML, so <, > and & must be escaped. */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
