import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { csrfCookieName } from './cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-csrf-token';

/**
 * CSRF por double-submit: el token vive en una cookie httpOnly SameSite=Strict
 * (emitida por GET /api/auth/csrf) y la SPA lo reenvía en el header X-CSRF-Token.
 * Además, si el navegador manda Origin, tiene que ser el de la aplicación. Ver ADR 0004.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    if (origin && origin !== this.config.appOrigin) {
      throw new ForbiddenException({ message: 'Origen no permitido', code: 'CSRF' });
    }
    const cookie: unknown = req.cookies?.[csrfCookieName(this.config)];
    const header = req.headers[CSRF_HEADER];
    if (typeof cookie !== 'string' || typeof header !== 'string' || !safeEqual(cookie, header)) {
      throw new ForbiddenException({ message: 'Token CSRF inválido', code: 'CSRF' });
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
