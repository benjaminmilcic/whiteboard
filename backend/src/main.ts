import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module.js';

// Locally: GROQ_API_KEY etc. from backend/.env. On the server systemd passes them in (EnvironmentFile).
if (existsSync('.env')) process.loadEnvFile();

/** The whiteboard on Firebase Hosting and `ng serve` during development. */
const DEFAULT_ORIGINS = [
  'https://whiteboard-32486.web.app',
  'https://whiteboard-32486.firebaseapp.com',
  'http://localhost:4200',
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const extraOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: [...DEFAULT_ORIGINS, ...extraOrigins] });
  // Only reachable through Apache on the server (it terminates TLS), like the other services there
  await app.listen(process.env.PORT ?? 3200, process.env.HOST ?? '127.0.0.1');
}
await bootstrap();
