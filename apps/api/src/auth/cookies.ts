import type { CookieOptions } from 'express';
import type { AppConfig } from '../config/config';

/** Con HTTPS se usa el prefijo __Host- (obliga Secure, Path=/ y sin Domain). */
export function sessionCookieName(config: AppConfig): string {
  return config.cookieSecure ? '__Host-tli_sid' : 'tli_sid';
}

export function csrfCookieName(config: AppConfig): string {
  return config.cookieSecure ? '__Host-tli_csrf' : 'tli_csrf';
}

export function sessionCookieOptions(config: AppConfig): CookieOptions {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' };
}

export function csrfCookieOptions(config: AppConfig): CookieOptions {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' };
}
