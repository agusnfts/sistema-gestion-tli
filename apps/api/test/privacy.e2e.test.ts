import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  createUser,
  loginAs,
  newClient,
  type Client,
  type TestContext,
  type TestUser,
} from './helpers';

let ctx: TestContext;
let admin: Client;
let adminUser: TestUser;

beforeAll(async () => {
  ctx = await createTestApp();
  adminUser = await createUser(ctx, 'admin', { withMfa: true });
  admin = await loginAs(ctx, adminUser);
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('derechos de los titulares', () => {
  it('IT no puede exportar ni anonimizar', async () => {
    const it_ = await loginAs(ctx, await createUser(ctx, 'it', { withMfa: true }));
    const someone = await createUser(ctx, 'user');
    await it_.get(`/api/privacy/users/${someone.id}/export`).expect(403);
    await it_.post(`/api/privacy/users/${someone.id}/anonymize`).expect(403);
  });

  it('exporta los datos del titular sin secretos y lo deja auditado', async () => {
    const titular = await createUser(ctx, 'user');
    const c = await loginAs(ctx, titular);
    await c
      .post('/api/tickets', {
        type: 'SUPPORT',
        category: 'WMS',
        subject: 'No puedo ingresar al WMS',
        description: 'Me dice usuario bloqueado.',
        userUrgency: 'HIGH',
        extra: {},
      })
      .expect(201);
    const res = await admin.get(`/api/privacy/users/${titular.id}/export`).expect(200);
    expect(res.body.user.email).toBe(titular.email);
    expect(res.body.tickets[0]).toMatchObject({ subject: 'No puedo ingresar al WMS' });
    expect(res.body.sessions.length).toBeGreaterThan(0);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/passwordHash|mfaSecret|tokenHash/);
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'privacy.exported', entityId: titular.id },
    });
    expect(audit?.actorId).toBe(adminUser.id);
  });

  it('anonimiza: no puede volver a entrar, los tickets quedan con el usuario anonimizado', async () => {
    const titular = await createUser(ctx, 'user');
    const c = await loginAs(ctx, titular);
    const t = await c
      .post('/api/tickets', {
        type: 'SUPPORT',
        category: 'TMS',
        subject: 'Consulta de hoja de ruta',
        description: 'No encuentro la hoja de ruta de hoy.',
        userUrgency: 'LOW',
        extra: {},
      })
      .expect(201);

    await admin.post(`/api/privacy/users/${titular.id}/anonymize`).expect(200);
    await admin.post(`/api/privacy/users/${titular.id}/anonymize`).expect(400);

    // La sesión que tenía abierta ya no sirve y no puede volver a ingresar.
    await c.get('/api/auth/me').expect(401);
    const again = await newClient(ctx);
    await again
      .post('/api/auth/login', { email: titular.email, password: titular.password })
      .expect(401);

    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { id: titular.id } });
    expect(u.email).toBe(`${titular.id}@anonimizado.invalid`);
    expect(u.fullName).toMatch(/^Usuario anonimizado/);
    expect(u.status).toBe('DISABLED');
    expect(u.anonymizedAt).not.toBeNull();

    const ticket = await admin.get(`/api/tickets/${t.body.id}`).expect(200);
    expect(ticket.body.requester.fullName).toMatch(/^Usuario anonimizado/);

    // La cadena de auditoría sigue íntegra.
    const verify = await admin.post('/api/audit/verify').expect(200);
    expect(verify.body.ok).toBe(true);
  });

  it('no se puede anonimizar a uno mismo', async () => {
    await admin.post(`/api/privacy/users/${adminUser.id}/anonymize`).expect(400);
  });
});
