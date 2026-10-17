import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RateLimit } from '../auth/auth.guard.js';
import { TranscriptionService, type Transcription } from './transcription.service.js';

/** The parts of a multer upload we need (avoids pulling in @types/multer). */
interface AudioUpload {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/** Groq accepts audio files up to 25 MB on the free tier. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

@Controller('transcribe')
export class TranscriptionController {
  constructor(private readonly transcriptionService: TranscriptionService) {}

  /** Expects multipart/form-data with the recording in the field `audio`; returns `{ text, language }`. */
  @Post()
  @RateLimit(20)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  async transcribe(@UploadedFile() audio?: AudioUpload): Promise<Transcription> {
    if (!audio?.buffer?.length) {
      throw new BadRequestException('audio file is required');
    }
    return this.transcriptionService.transcribe(audio.buffer, audio.originalname, audio.mimetype);
  }
}
