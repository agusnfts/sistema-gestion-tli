import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import { createTestApp, createUser, newClient, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('health', () => {
  it('responde ok sin sesión', async () => {
    const c = await newClient(ctx);
    const res = await c.get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });
});

describe('CSRF', () => {
  it('rechaza un POST sin token', async () => {
    const c = await newClient(ctx);
    const res = await c.agent.post('/api/auth/login').send({ email: 'x@tli.test', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF');
  });

  it('rechaza un Origin ajeno aunque el token sea válido', async () => {
    const c = await newClient(ctx);
    const res = await c
      .post('/api/auth/login', { email: 'x@tli.test', password: 'x' })
      .set('Origin', 'https://malicioso.example');
    expect(res.status).toBe(403);
  });
});

describe('login', () => {
  it('devuelve el mismo error para contraseña incorrecta y usuario inexistente', async () => {
    const user = await createUser(ctx, 'user');
    const c = await newClient(ctx);
    const wrong = await c.post('/api/auth/login', { email: user.email, password: 'incorrecta' });
    const unknown = await c.post('/api/auth/login', {
      email: 'nadie@tli.test',
      password: 'incorrecta',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('usuario común: accede sin MFA, ve sus permisos y no puede administrar', async () => {
    const user = await createUser(ctx, 'user');
    const c = await newClient(ctx);
    const login = await c
      .post('/api/auth/login', { email: user.email, password: user.password })
      .expect(200);
    expect(login.body.next).toBe('DONE');
    const cookie = login.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await c.get('/api/auth/me').expect(200);
    expect(me.body.permissions).toEqual([
      'kb.read.public',
      'ticket.comment.own',
      'ticket.create',
      'ticket.read.own',
    ]);
    expect(me.body.mfaRequired).toBe(false);

    await c.get('/api/users').expect(403);
    await c.get('/api/audit').expect(403);

    await c.post('/api/auth/logout').expect(204);
    await c.get('/api/auth/me').expect(401);
  });

  it('bloquea la cuenta después de 5 intentos fallidos', async () => {
    const user = await createUser(ctx, 'user');
    const c = await newClient(ctx);
    for (let i = 0; i < 5; i++) {
      await c.post('/api/auth/login', { email: user.email, password: 'incorrecta' }).expect(401);
    }
    // Ni con la contraseña correcta entra mientras dura el bloqueo.
    await c.post('/api/auth/login', { email: user.email, password: user.password }).expect(401);
    const locked = await ctx.prisma.auditLog.findFirst({
      where: { actorId: user.id, action: 'auth.login.locked' },
    });
    expect(locked).not.toBeNull();
  });
});

describe('MFA', () => {
  it('Admin sin MFA tiene que configurarlo antes de acceder', async () => {
    const admin = await createUser(ctx, 'admin');
    const c = await newClient(ctx);
    const login = await c
      .post('/api/auth/login', { email: admin.email, password: admin.password })
      .expect(200);
    expect(login.body.next).toBe('MFA_SETUP');

    const blocked = await c.get('/api/users').expect(403);
    expect(blocked.body.code).toBe('AUTH_INCOMPLETE');

    const setup = await c.post('/api/auth/mfa/setup').expect(200);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const code = authenticator.generate(setup.body.secret);
    await c
      .post('/api/auth/mfa/setup/confirm', { code: code === '000000' ? '111111' : '000000' })
      .expect(400);
    const confirm = await c.post('/api/auth/mfa/setup/confirm', { code }).expect(200);
    expect(confirm.body.recoveryCodes).toHaveLength(10);
    await c.get('/api/users').expect(200);
  });

  it('IT con MFA: verifica el código, rota la sesión y no acepta reutilizar el código', async () => {
    const it_ = await createUser(ctx, 'it', { withMfa: true });
    const c = await newClient(ctx);
    const login = await c
      .post('/api/auth/login', { email: it_.email, password: it_.password })
      .expect(200);
    expect(login.body.next).toBe('MFA_VERIFY');
    const preMfaCookie = login.headers['set-cookie']?.[0]?.split(';')[0] ?? '';

    await c.post('/api/auth/mfa/verify', { code: 'abc' }).expect(400);
    const code = authenticator.generate(it_.totpSecret!);
    const verify = await c.post('/api/auth/mfa/verify', { code }).expect(200);
    const postMfaCookie = verify.headers['set-cookie']?.[0]?.split(';')[0] ?? '';
    expect(postMfaCookie).not.toBe(preMfaCookie);

    // IT accede a catálogos pero no a usuarios.
    await c.get('/api/catalogs/warehouses').expect(200);
    await c.get('/api/users').expect(403);

    // El token anterior a la verificación ya no sirve.
    const stale = await newClient(ctx);
    await stale.agent.get('/api/auth/me').set('Cookie', preMfaCookie).expect(401);

    // El mismo código no se puede usar en otra sesión.
    const c2 = await newClient(ctx);
    await c2.post('/api/auth/login', { email: it_.email, password: it_.password }).expect(200);
    await c2.post('/api/auth/mfa/verify', { code }).expect(401);
  });

  it('un código de recuperación sirve una sola vez', async () => {
    const admin = await createUser(ctx, 'admin');
    const c = await newClient(ctx);
    await c.post('/api/auth/login', { email: admin.email, password: admin.password }).expect(200);
    const setup = await c.post('/api/auth/mfa/setup').expect(200);
    const confirm = await c
      .post('/api/auth/mfa/setup/confirm', { code: authenticator.generate(setup.body.secret) })
      .expect(200);
    const recovery: string = confirm.body.recoveryCodes[0];

    const c2 = await newClient(ctx);
    await c2.post('/api/auth/login', { email: admin.email, password: admin.password }).expect(200);
    await c2.post('/api/auth/mfa/verify', { recoveryCode: recovery }).expect(200);
    await c2.get('/api/users').expect(200);

    const c3 = await newClient(ctx);
    await c3.post('/api/auth/login', { email: admin.email, password: admin.password }).expect(200);
    await c3.post('/api/auth/mfa/verify', { recoveryCode: recovery }).expect(401);
  });
});

describe('cambio de contraseña', () => {
  it('obliga a cambiar la contraseña temporal, valida la política y revoca otras sesiones', async () => {
    const user = await createUser(ctx, 'user', { mustChangePassword: true });
    const other = await newClient(ctx);
    await other.post('/api/auth/login', { email: user.email, password: user.password }).expect(200);

    const c = await newClient(ctx);
    const login = await c
      .post('/api/auth/login', { email: user.email, password: user.password })
      .expect(200);
    expect(login.body.next).toBe('CHANGE_PASSWORD');

    const weak = await c
      .post('/api/auth/password', { currentPassword: user.password, newPassword: 'corta' })
      .expect(400);
    expect(weak.body.issues[0].path).toBe('newPassword');

    await c
      .post('/api/auth/password', {
        currentPassword: user.password,
        newPassword: 'una frase nueva y larga',
      })
      .expect(200);
    const me = await c.get('/api/auth/me').expect(200);
    expect(me.body.next).toBe('DONE');

    await other.get('/api/auth/me').expect(401);
  });
});
