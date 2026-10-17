import { BadRequestException, Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimit } from '../auth/auth.guard.js';
import type { Language } from '../chat/prompts.js';
import { SpeechService, speakable } from './speech.service.js';

interface SpeechRequest {
  text: string;
  language?: Language;
}

const LANGUAGES: Language[] = ['hr', 'de', 'en'];
/** The app sends one or a few sentences at a time. */
const MAX_TEXT_CHARS = 2000;

@Controller('speech')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  /** Reads `text` aloud in the voice of `language`; returns the audio as MP3 (empty response if nothing to say). */
  @Post()
  // The app requests one call per sentence
  @RateLimit(90)
  async speak(@Body() body: SpeechRequest, @Res() res: Response): Promise<void> {
    if (typeof body?.text !== 'string' || body.text.length > MAX_TEXT_CHARS) {
      throw new BadRequestException('text is required');
    }
    const language = LANGUAGES.includes(body.language as Language) ? (body.language as Language) : 'hr';
    if (!speakable(body.text)) {
      res.status(204).end();
      return;
    }
    const audio = await this.speechService.synthesize(body.text, language);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.end(audio);
  }
}
