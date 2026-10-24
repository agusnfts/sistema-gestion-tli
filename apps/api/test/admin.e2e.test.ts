import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createTestApp,
  createUser,
  loginAs,
  newClient,
  type Client,
  type TestContext,
} from './helpers';

let ctx: TestContext;
let admin: Client;
let adminId: string;
let roleIds: Record<string, string>;

beforeAll(async () => {
  ctx = await createTestApp();
  const a = await createUser(ctx, 'admin', { withMfa: true });
  adminId = a.id;
  admin = await loginAs(ctx, a);
  const roles = await admin.get('/api/roles').expect(200);
  roleIds = Object.fromEntries(roles.body.map((r: { key: string; id: string }) => [r.key, r.id]));
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('usuarios', () => {
  it('Admin crea un usuario con contraseña temporal que hay que cambiar', async () => {
    const email = `alta-${randomUUID()}@tli.test`;
    const res = await admin
      .post('/api/users', {
        email: email.toUpperCase(),
        fullName: 'Ana Pérez',
        roleIds: [roleIds.user],
      })
      .expect(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}-\w{4}$/);

    const c = await newClient(ctx);
    const login = await c
      .post('/api/auth/login', { email, password: res.body.temporaryPassword })
      .expect(200);
    expect(login.body.next).toBe('CHANGE_PASSWORD');

    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'user.created', entityId: res.body.user.id },
    });
    expect(audit?.actorId).toBe(adminId);
  });

  it('valida el input con los schemas compartidos', async () => {
    const res = await admin
      .post('/api/users', { email: 'no-es-email', fullName: 'A', roleIds: [] })
      .expect(400);
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'fullName', 'roleIds']));
  });

  it('rechaza emails duplicados', async () => {
    const u = await createUser(ctx, 'user');
    await admin
      .post('/api/users', { email: u.email, fullName: 'Duplicado', roleIds: [roleIds.user] })
      .expect(409);
  });

  it('deshabilitar un usuario cierra sus sesiones', async () => {
    const u = await createUser(ctx, 'user');
    const c = await loginAs(ctx, u);
    await c.get('/api/auth/me').expect(200);
    await admin.patch(`/api/users/${u.id}`, { status: 'DISABLED' }).expect(200);
    await c.get('/api/auth/me').expect(401);
  });

  it('cambiar roles revoca sesiones y queda auditado', async () => {
    const u = await createUser(ctx, 'user');
    const c = await loginAs(ctx, u);
    await admin.patch(`/api/users/${u.id}`, { roleIds: [roleIds.it] }).expect(200);
    await c.get('/api/auth/me').expect(401);
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'user.roles.changed', entityId: u.id },
    });
    expect(audit?.metadata).toMatchObject({ from: ['user'], to: ['it'] });
  });

  it('el Admin no puede deshabilitarse a sí mismo', async () => {
    await admin.patch(`/api/users/${adminId}`, { status: 'DISABLED' }).expect(400);
  });

  it('resetear MFA obliga a configurarlo de nuevo', async () => {
    const u = await createUser(ctx, 'it', { withMfa: true });
    await admin.post(`/api/users/${u.id}/reset-mfa`).expect(200);
    const c = await newClient(ctx);
    const login = await c
      .post('/api/auth/login', { email: u.email, password: u.password })
      .expect(200);
    expect(login.body.next).toBe('MFA_SETUP');
  });

  it('IT no puede administrar usuarios ni catálogos', async () => {
    const it_ = await loginAs(ctx, await createUser(ctx, 'it', { withMfa: true }));
    await it_.get('/api/users').expect(403);
    await it_.post('/api/catalogs/areas', { name: 'No debería' }).expect(403);
    await it_.get('/api/catalogs/areas').expect(200);
  });
});

describe('roles', () => {
  it('crea un rol personalizado y no permite editar roles de sistema', async () => {
    const key = `comercial_${Date.now()}`;
    const res = await admin
      .post('/api/roles', {
        key,
        name: 'Comercial',
        permissions: ['client.read', 'integration.read'],
      })
      .expect(201);
    expect(res.body.permissions).toEqual(['client.read', 'integration.read']);
    await admin.patch(`/api/roles/${roleIds.admin}`, { name: 'Otro' }).expect(400);
    await admin.delete(`/api/roles/${res.body.id}`).expect(204);
  });

  it('un rol con permisos de gestión exige MFA a sus usuarios', async () => {
    const key = `lectura_${Date.now()}`;
    await admin
      .post('/api/roles', { key, name: 'Lectura clientes', permissions: ['client.read'] })
      .expect(201);
    const u = await createUser(ctx, key);
    const c = await newClient(ctx);
    const login = await c
      .post('/api/auth/login', { email: u.email, password: u.password })
      .expect(200);
    expect(login.body.next).toBe('MFA_SETUP');
  });
});

describe('catálogos', () => {
  it('Admin da de alta y desactiva; los inactivos no aparecen en la lista común', async () => {
    const name = `Área ${Date.now()}`;
    const created = await admin.post('/api/catalogs/areas', { name }).expect(201);
    await admin.patch(`/api/catalogs/areas/${created.body.id}`, { active: false }).expect(200);
    const active = await admin.get('/api/catalogs/areas').expect(200);
    expect(active.body.map((a: { name: string }) => a.name)).not.toContain(name);
    const all = await admin.get('/api/catalogs/areas?includeInactive=true').expect(200);
    expect(all.body.map((a: { name: string }) => a.name)).toContain(name);
  });

  it('rechaza tipos de catálogo inexistentes', async () => {
    await admin.get('/api/catalogs/inventado').expect(400);
  });
});

describe('auditoría', () => {
  it('la tabla es append-only', async () => {
    await expect(
      ctx.prisma.$executeRawUnsafe('UPDATE "AuditLog" SET action = \'x\''),
    ).rejects.toThrow();
    await expect(ctx.prisma.$executeRawUnsafe('DELETE FROM "AuditLog"')).rejects.toThrow();
  });

  it('la cadena de hashes verifica y se puede consultar con filtros', async () => {
    const verify = await admin.post('/api/audit/verify').expect(200);
    expect(verify.body.ok).toBe(true);
    expect(verify.body.checked).toBeGreaterThan(0);
    const list = await admin.get('/api/audit?action=audit.chain.verified&pageSize=5').expect(200);
    expect(list.body.items[0].action).toBe('audit.chain.verified');
  });
});
