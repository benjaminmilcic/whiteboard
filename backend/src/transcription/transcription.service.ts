import { Injectable } from '@nestjs/common';
import { toFile } from 'openai';
import type { Language } from '../chat/prompts.js';
import { groq, models } from '../groq.js';

export interface Transcription {
  text: string;
  /** The spoken language, if it is one of the app's languages – used to pick the voice of the answer. */
  language: Language | null;
}

/**
 * Whisper's language names mapped to the app languages. Croatian is sometimes detected as one of its
 * neighbouring languages – for an 8-year-old from Croatia it is Croatian.
 */
const LANGUAGES: Record<string, Language> = {
  croatian: 'hr',
  serbian: 'hr',
  bosnian: 'hr',
  montenegrin: 'hr',
  slovenian: 'hr',
  german: 'de',
  english: 'en',
};

/** Serbian Cyrillic to Croatian Latin – Whisper writes Croatian in Cyrillic when it takes it for Serbian. */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l',
  љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h',
  ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

@Injectable()
export class TranscriptionService {
  /**
   * Turns a recorded audio clip into text with whisper-large-v3 – always the large model, because it recognises
   * Croatian much better than turbo. The language is detected automatically.
   */
  async transcribe(audio: Buffer, filename: string, mimeType: string): Promise<Transcription> {
    const result = await groq().audio.transcriptions.create({
      model: models.transcription,
      file: await toFile(audio, filename, { type: mimeType }),
      response_format: 'verbose_json',
      temperature: 0,
    });
    return {
      text: toLatin(result.text.trim()),
      language: LANGUAGES[result.language?.toLowerCase() ?? ''] ?? null,
    };
  }
}

function toLatin(text: string): string {
  return text.replace(/[Ѐ-ӿ]/g, (char) => {
    const latin = CYRILLIC[char.toLowerCase()];
    if (latin === undefined) return char;
    return char === char.toLowerCase() ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
  });
}
