import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_KEY, type AccessPolicy } from '../common/decorators';
import type { RequestWithAuth } from '../common/auth-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { SessionService } from './session.service';
import { sessionCookieName } from './cookies';

/**
 * Guard global de autenticación y autorización (deny by default).
 * Todo endpoint tiene que declarar su política con un decorador de common/decorators.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!policy) {
      this.logger.warn(
        `Endpoint sin política de acceso: ${ctx.getClass().name}.${ctx.getHandler().name}`,
      );
      throw new ForbiddenException('Acceso denegado');
    }
    if (policy.kind === 'public') return true;

    const req = ctx.switchToHttp().getRequest<RequestWithAuth>();
    const token: unknown = req.cookies?.[sessionCookieName(this.config)];
    const auth = typeof token === 'string' && token ? await this.sessions.resolve(token) : null;
    if (!auth) throw new UnauthorizedException('Tu sesión expiró. Volvé a iniciar sesión.');
    req.auth = auth;

    if (policy.kind === 'incomplete') return true;
    if (auth.next !== 'DONE') {
      throw new ForbiddenException({
        message: 'Completá el inicio de sesión',
        code: 'AUTH_INCOMPLETE',
      });
    }
    if (policy.kind === 'authenticated') return true;

    const allowed =
      policy.kind === 'all'
        ? policy.permissions.every((p) => auth.permissions.has(p))
        : policy.permissions.some((p) => auth.permissions.has(p));
    if (!allowed) throw new ForbiddenException('No tenés permiso para esta acción');
    return true;
  }
}
