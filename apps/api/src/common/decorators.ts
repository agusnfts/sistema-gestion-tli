import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { PermissionKey } from '@tli/shared';
import {
  requestMeta,
  type AuthContext,
  type RequestMeta,
  type RequestWithAuth,
} from './auth-context';

export const ACCESS_KEY = 'tli:access';

/**
 * Política de acceso de un endpoint. Un endpoint sin política se deniega (deny by default).
 * - public: sin sesión.
 * - incomplete: sesión válida aunque falte MFA o cambio de contraseña (flujo de login).
 * - authenticated: sesión completa, sin permiso específico.
 * - all / any: sesión completa y todos / alguno de los permisos.
 */
export type AccessPolicy =
  | { kind: 'public' }
  | { kind: 'incomplete' }
  | { kind: 'authenticated' }
  | { kind: 'all'; permissions: PermissionKey[] }
  | { kind: 'any'; permissions: PermissionKey[] };

export const Public = () => SetMetadata(ACCESS_KEY, { kind: 'public' } satisfies AccessPolicy);

export const AllowIncompleteAuth = () =>
  SetMetadata(ACCESS_KEY, { kind: 'incomplete' } satisfies AccessPolicy);

export const Authenticated = () =>
  SetMetadata(ACCESS_KEY, { kind: 'authenticated' } satisfies AccessPolicy);

export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(ACCESS_KEY, { kind: 'all', permissions } satisfies AccessPolicy);

export const RequireAnyPermission = (...permissions: PermissionKey[]) =>
  SetMetadata(ACCESS_KEY, { kind: 'any', permissions } satisfies AccessPolicy);

export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<RequestWithAuth>();
    if (!req.auth) throw new UnauthorizedException();
    return req.auth;
  },
);

export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta =>
  requestMeta(ctx.switchToHttp().getRequest()),
);
