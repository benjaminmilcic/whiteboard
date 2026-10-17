import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/** Requests per user and minute, per endpoint – set with @RateLimit(n). */
export const RateLimit = (perMinute: number) => SetMetadata('rateLimit', perMinute);
/** Endpoints that need no login (health check). */
export const Public = () => SetMetadata('public', true);

const DEFAULT_LIMIT = 30;
const WINDOW_MS = 60_000;

/**
 * Only the whiteboard app may use the API: every request carries the ID token of the anonymous Firebase login
 * the whiteboard does anyway (`Authorization: Bearer <token>`). Verifying it needs only the project ID, no service
 * account. On top of that, each user gets a few requests per minute, so nobody can use up the Groq quota.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  /** Start times of the requests in the current window, per user and endpoint. */
  private readonly requests = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {
    if (!getApps().length) {
      initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'whiteboard-32486' });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    if (this.reflector.get<boolean>('public', handler)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException();
    const uid = await getAuth()
      .verifyIdToken(token)
      .then((decoded) => decoded.uid)
      .catch(() => {
        throw new UnauthorizedException();
      });

    const limit = this.reflector.get<number>('rateLimit', handler) ?? DEFAULT_LIMIT;
    this.checkRateLimit(`${uid}:${request.path}`, limit);
    return true;
  }

  private checkRateLimit(key: string, limit: number): void {
    const now = Date.now();
    const recent = (this.requests.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
    if (recent.length >= limit) throw new HttpException('rate_limit', HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now);
    this.requests.set(key, recent);
    // Forget users that have been quiet for a while, so the map does not grow forever
    if (this.requests.size > 1000) {
      for (const [k, times] of this.requests) {
        if (!times.some((time) => now - time < WINDOW_MS)) this.requests.delete(k);
      }
    }
  }
}
