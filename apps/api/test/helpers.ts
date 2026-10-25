import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authenticator } from 'otplib';
import { randomUUID } from 'node:crypto';
import { hashPassword, seedBase } from '@tli/db';
import type { SystemRoleKey } from '@tli/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_CONFIG, type AppConfig } from '../src/config/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { encryptSecret, generateTotpSecret } from '../src/auth/mfa-crypto';

export const TEST_PASSWORD = 'clave-de-prueba-e2e-2026';

export type TestContext = { app: INestApplication; prisma: PrismaService; config: AppConfig };

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  await app.init();
  const prisma = app.get(PrismaService);
  await seedBase(prisma);
  return { app, prisma, config };
}

export type TestUser = { id: string; email: string; password: string; totpSecret?: string };

export async function createUser(
  ctx: TestContext,
  role: SystemRoleKey | string,
  opts: { mustChangePassword?: boolean; withMfa?: boolean } = {},
): Promise<TestUser> {
  const email = `e2e-${randomUUID()}@tli.test`;
  const totpSecret = opts.withMfa ? generateTotpSecret() : undefined;
  const roleRow = await ctx.prisma.role.findUniqueOrThrow({ where: { key: role } });
  const user = await ctx.prisma.user.create({
    data: {
      email,
      fullName: 'Persona de Prueba',
      passwordHash: await hashPassword(TEST_PASSWORD),
      mustChangePassword: opts.mustChangePassword ?? false,
      mfaSecretEnc: totpSecret ? encryptSecret(totpSecret, ctx.config.mfa.encryptionKey) : null,
      mfaEnabledAt: totpSecret ? new Date() : null,
      roles: { create: { roleId: roleRow.id } },
    },
  });
  return { id: user.id, email, password: TEST_PASSWORD, totpSecret };
}

/** Cliente HTTP con cookies persistentes y token CSRF. */
export class Client {
  readonly agent: ReturnType<typeof request.agent>;
  private csrf = '';

  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  async init(): Promise<this> {
    const res = await this.agent.get('/api/auth/csrf').expect(200);
    this.csrf = res.body.token;
    return this;
  }

  get(url: string) {
    return this.agent.get(url);
  }

  post(url: string, body: object = {}) {
    return this.agent.post(url).set('x-csrf-token', this.csrf).send(body);
  }

  patch(url: string, body: object = {}) {
    return this.agent.patch(url).set('x-csrf-token', this.csrf).send(body);
  }

  upload(data: Buffer, filename: string) {
    return this.agent
      .post('/api/attachments')
      .set('x-csrf-token', this.csrf)
      .attach('file', data, filename);
  }

  put(url: string, body: object = {}) {
    return this.agent.put(url).set('x-csrf-token', this.csrf).send(body);
  }

  delete(url: string) {
    return this.agent.delete(url).set('x-csrf-token', this.csrf);
  }
}

export async function newClient(ctx: TestContext): Promise<Client> {
  return new Client(ctx.app).init();
}

/** Login completo (incluye MFA si el usuario lo tiene). */
export async function loginAs(ctx: TestContext, user: TestUser): Promise<Client> {
  const client = await newClient(ctx);
  const res = await client
    .post('/api/auth/login', { email: user.email, password: user.password })
    .expect(200);
  if (res.body.next === 'MFA_VERIFY') {
    // Cada código se puede usar una sola vez: se libera el último paso usado para poder repetir logins.
    await ctx.prisma.user.update({ where: { id: user.id }, data: { mfaLastUsedStep: null } });
    await client
      .post('/api/auth/mfa/verify', { code: authenticator.generate(user.totpSecret!) })
      .expect(200);
  }
  return client;
}
