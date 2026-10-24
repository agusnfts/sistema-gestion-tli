import type { AuthNextStep, PermissionKey } from '@tli/shared';
import type { Request } from 'express';

/** Identidad resuelta para el request actual. La completa AuthGuard. */
export type AuthContext = {
  sessionId: string;
  user: { id: string; email: string; fullName: string };
  permissions: ReadonlySet<PermissionKey>;
  mfaRequired: boolean;
  next: AuthNextStep;
};

export type RequestWithAuth = Request & { auth?: AuthContext };

/** Datos del request que se guardan en auditoría y sesiones. */
export type RequestMeta = { ip: string | null; userAgent: string | null };

export function requestMeta(req: Request): RequestMeta {
  const ua = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua.slice(0, 300) : null };
}
