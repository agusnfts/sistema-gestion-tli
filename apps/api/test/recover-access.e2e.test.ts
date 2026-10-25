import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recoverAccess } from '@tli/db';
import { createTestApp, createUser, loginAs, newClient, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('recuperación de acceso desde el servidor', () => {
  it('resetea MFA, pone contraseña temporal, cierra sesiones y audita sin romper la cadena', async () => {
    const admin = await createUser(ctx, 'admin', { withMfa: true });
    const oldSession = await loginAs(ctx, admin);
    await ctx.prisma.user.update({
      where: { id: admin.id },
      data: { failedLoginCount: 7, lockedUntil: new Date(Date.now() + 3_600_000) },
    });

    const { temporaryPassword } = await recoverAccess(ctx.prisma, admin.email);

    await oldSession.get('/api/auth/me').expect(401);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(user.mfaSecretEnc).toBeNull();
    expect(user.mfaEnabledAt).toBeNull();
    expect(user.lockedUntil).toBeNull();
    expect(await ctx.prisma.mfaRecoveryCode.count({ where: { userId: admin.id } })).toBe(0);

    const c = await newClient(ctx);
    const login = await c
      .post('/api/auth/login', { email: admin.email, password: temporaryPassword })
      .expect(200);
    expect(login.body.next).toBe('CHANGE_PASSWORD');

    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'user.access.recovered', entityId: admin.id },
    });
    expect(audit?.actorId).toBeNull();
    expect(audit?.metadata).toMatchObject({ via: 'cli', sessionsRevoked: 1 });

    const verifier = await loginAs(ctx, await createUser(ctx, 'admin', { withMfa: true }));
    const verify = await verifier.post('/api/audit/verify').expect(200);
    expect(verify.body.ok).toBe(true);
  });

  it('no reactiva usuarios deshabilitados ni inventa usuarios', async () => {
    const u = await createUser(ctx, 'user');
    await ctx.prisma.user.update({ where: { id: u.id }, data: { status: 'DISABLED' } });
    await expect(recoverAccess(ctx.prisma, u.email)).rejects.toThrow(/deshabilitado/);
    await expect(recoverAccess(ctx.prisma, 'nadie@tli.test')).rejects.toThrow(/No existe/);
  });
});
