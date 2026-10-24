import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import {
  changePasswordSchema,
  loginSchema,
  mfaConfirmSchema,
  mfaVerifySchema,
  type ChangePasswordInput,
  type LoginInput,
  type LoginResponse,
  type MfaConfirmInput,
  type MfaConfirmResponse,
  type MfaVerifyInput,
} from '@tli/shared';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import {
  AllowIncompleteAuth,
  Authenticated,
  CurrentAuth,
  Public,
  ReqMeta,
} from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';
import {
  csrfCookieName,
  csrfCookieOptions,
  sessionCookieName,
  sessionCookieOptions,
} from './cookies';

// Límite por IP para endpoints sensibles (login, MFA, contraseña). Se resuelve en cada request.
const authThrottle = () => ({
  default: { limit: () => Number(process.env.THROTTLE_AUTH_LIMIT ?? 10), ttl: 60_000 },
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private setSessionCookie(res: Response, token: string): void {
    res.cookie(sessionCookieName(this.config), token, sessionCookieOptions(this.config));
  }

  @Get('csrf')
  @Public()
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response): { token: string } {
    const name = csrfCookieName(this.config);
    const existing: unknown = req.cookies?.[name];
    const token =
      typeof existing === 'string' && /^[A-Za-z0-9_-]{43}$/.test(existing)
        ? existing
        : randomBytes(32).toString('base64url');
    res.cookie(name, token, csrfCookieOptions(this.config));
    return { token };
  }

  @Post('login')
  @HttpCode(200)
  @Public()
  @Throttle(authThrottle())
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { token, next } = await this.auth.login(body, meta);
    this.setSessionCookie(res, token);
    return { next };
  }

  @Post('logout')
  @HttpCode(204)
  @AllowIncompleteAuth()
  async logout(
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth, meta);
    res.clearCookie(sessionCookieName(this.config), sessionCookieOptions(this.config));
  }

  @Get('me')
  @AllowIncompleteAuth()
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @Post('mfa/setup')
  @HttpCode(200)
  @AllowIncompleteAuth()
  startMfaSetup(@CurrentAuth() auth: AuthContext) {
    return this.auth.startMfaSetup(auth);
  }

  @Post('mfa/setup/confirm')
  @HttpCode(200)
  @AllowIncompleteAuth()
  @Throttle(authThrottle())
  async confirmMfaSetup(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(mfaConfirmSchema)) body: MfaConfirmInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MfaConfirmResponse> {
    const { token, recoveryCodes } = await this.auth.confirmMfaSetup(auth, body.code, meta);
    this.setSessionCookie(res, token);
    return { recoveryCodes };
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @AllowIncompleteAuth()
  @Throttle(authThrottle())
  async verifyMfa(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(mfaVerifySchema)) body: MfaVerifyInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    this.setSessionCookie(res, await this.auth.verifyMfa(auth, body, meta));
    return { ok: true };
  }

  @Post('password')
  @HttpCode(200)
  @AllowIncompleteAuth()
  @Throttle(authThrottle())
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    this.setSessionCookie(res, await this.auth.changePassword(auth, body, meta));
    return { ok: true };
  }

  @Get('sessions')
  @Authenticated()
  listSessions(@CurrentAuth() auth: AuthContext) {
    return this.sessions.listActive(auth.user.id, auth.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @Authenticated()
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.auth.revokeOwnSession(auth, id, meta);
  }
}
