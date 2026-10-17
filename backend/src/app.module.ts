import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { AuthGuard, Public } from './auth/auth.guard.js';
import { ChatModule } from './chat/chat.module.js';
import { SpeechModule } from './speech/speech.module.js';
import { TranscriptionModule } from './transcription/transcription.module.js';

/**
 * Commit of the running build: the deploy workflow writes dist/build-info.json, so after a restart it can prove
 * that the new version answers and not still the old one. Empty locally.
 */
const BUILD_SHA = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('./build-info.json', import.meta.url), 'utf8')) as { sha?: string }).sha ?? '';
  } catch {
    return '';
  }
})();

@Controller('health')
class HealthController {
  /** For the deploy workflow and monitoring – no login needed. */
  @Public()
  @Get()
  health(): { status: string; sha: string } {
    return { status: 'ok', sha: BUILD_SHA };
  }
}

@Module({
  imports: [ChatModule, SpeechModule, TranscriptionModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
