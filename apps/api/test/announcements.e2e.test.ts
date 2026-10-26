import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMAIL_SENDER, type MemoryEmailSender } from '../src/notifications/email-sender';
import { AnnouncementsService } from '../src/announcements/announcements.service';
import { createTestApp, createUser, loginAs, type Client, type TestContext } from './helpers';

let ctx: TestContext;
let admin: Client;
let it_: Client;
let user: Client;
let warehouseId: string;
let warehouseUserId: string;

const HOUR = 3_600_000;
const outbox = () => (ctx.app.get(EMAIL_SENDER) as MemoryEmailSender).outbox;

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await loginAs(ctx, await createUser(ctx, 'admin', { withMfa: true }));
  it_ = await loginAs(ctx, await createUser(ctx, 'it', { withMfa: true }));
  const plain = await createUser(ctx, 'user');
  user = await loginAs(ctx, plain);
  const warehouse = await ctx.prisma.warehouse.create({ data: { name: `Dep ${randomUUID()}` } });
  warehouseId = warehouse.id;
  warehouseUserId = plain.id;
  await ctx.prisma.user.update({
    where: { id: plain.id },
    data: { defaultWarehouseId: warehouseId },
  });
});

afterAll(async () => {
  await ctx?.app.close();
});

async function newList(emails: string[]) {
  const res = await it_
    .post('/api/distribution-lists', { name: `Lista ${randomUUID()}`, emails })
    .expect(201);
  return res.body as { id: string; emails: string[] };
}

function announcement(overrides: object = {}) {
  return {
    title: 'Actualización de versión del WMS',
    systems: ['WMS'],
    reason: 'Nueva versión con mejoras de picking',
    impact: 'OUTAGE',
    startsAt: new Date(Date.now() + 48 * HOUR).toISOString(),
    endsAt: new Date(Date.now() + 50 * HOUR).toISOString(),
    ...overrides,
  };
}

describe('catálogo de sistemas', () => {
  it('los cuatro sistemas arrancan con SGL como proveedor', async () => {
    const res = await user.get('/api/systems').expect(200);
    expect(res.body.map((s: { key: string }) => s.key)).toEqual(['WMS', 'TMS', 'TYT', 'ROUTING']);
    for (const s of res.body) expect(s.provider?.name).toBe('SGL');
  });

  it('solo quien gestiona catálogos cambia el proveedor; las mejoras nuevas lo heredan', async () => {
    const molipa = await ctx.prisma.provider.findUniqueOrThrow({ where: { name: 'Molipa' } });
    await it_.patch('/api/systems/TYT', { providerId: molipa.id }).expect(403);
    await admin.patch('/api/systems/TYT', { providerId: molipa.id }).expect(200);
    try {
      const created = await it_
        .post('/api/improvements', {
          title: 'Validar CUIT en carga de pedidos',
          system: 'TYT',
          currentSituation: 'Se cargan pedidos con CUIT inválido',
          proposal: 'Validar el dígito verificador',
          impact: 2,
          effort: 1,
        })
        .expect(201);
      expect(created.body.provider?.name).toBe('Molipa');
    } finally {
      const sgl = await ctx.prisma.provider.findUniqueOrThrow({ where: { name: 'SGL' } });
      await admin.patch('/api/systems/TYT', { providerId: sgl.id }).expect(200);
    }
  });
});

describe('listas de distribución', () => {
  it('normaliza los mails, no repite y rechaza inválidos; un usuario común no accede', async () => {
    const list = await newList([
      'Jefe.Garin@TML.com.ar',
      'jefe.garin@tml.com.ar',
      'otro@tml.com.ar',
    ]);
    expect(list.emails).toEqual(['jefe.garin@tml.com.ar', 'otro@tml.com.ar']);
    await it_
      .post('/api/distribution-lists', { name: `Mala ${randomUUID()}`, emails: ['no-es-mail'] })
      .expect(400);
    await user.get('/api/distribution-lists').expect(403);
  });
});

describe('avisos de actualización', () => {
  it('un usuario común no los gestiona, pero ve las próximas ya avisadas', async () => {
    await user.post('/api/announcements', announcement()).expect(403);
    const list = await newList(['operacion@tml.com.ar']);
    const { body: a } = await it_
      .post('/api/announcements', announcement({ distributionListIds: [list.id] }))
      .expect(201);
    let upcoming = await user.get('/api/announcements/upcoming').expect(200);
    expect(upcoming.body.some((u: { id: string }) => u.id === a.id)).toBe(false);
    await it_.post(`/api/announcements/${a.id}/send`).expect(200);
    upcoming = await user.get('/api/announcements/upcoming').expect(200);
    expect(upcoming.body.find((u: { id: string }) => u.id === a.id)).toMatchObject({
      code: a.code,
      inProgress: false,
    });
  });

  it('valida fechas y exige destinatarios para enviar', async () => {
    await it_
      .post(
        '/api/announcements',
        announcement({ endsAt: new Date(Date.now() + 47 * HOUR).toISOString() }),
      )
      .expect(400);
    const { body: a } = await it_.post('/api/announcements', announcement()).expect(201);
    expect(a.status).toBe('DRAFT');
    expect(a.providers).toEqual([{ system: 'WMS', provider: 'SGL' }]);
    const res = await it_.post(`/api/announcements/${a.id}/send`).expect(400);
    expect(res.body.message).toMatch(/destinatarios/);
  });

  it('sin mail activo: queda avisada, la campana llega a los usuarios y no sale ningún mail', async () => {
    outbox().length = 0;
    const list = await newList(['jefes@tml.com.ar']);
    const { body: a } = await it_
      .post(
        '/api/announcements',
        announcement({ distributionListIds: [list.id], warehouseIds: [warehouseId] }),
      )
      .expect(201);
    expect(a.recipients).toEqual({ emailCount: 2, userCount: 1 });
    const res = await it_.post(`/api/announcements/${a.id}/send`).expect(200);
    expect(res.body).toMatchObject({ emailed: false, emailCount: 2, userCount: 1 });
    expect(res.body.announcement.status).toBe('SCHEDULED');
    expect(outbox()).toHaveLength(0);
    const bell = await ctx.prisma.notification.findFirst({
      where: { userId: warehouseUserId, entityId: a.id, kind: 'SYSTEM_UPDATE' },
    });
    expect(bell?.title).toMatch(/Actualización de WMS/);
  });

  it('con mail activo: un mail por destinatario, recordatorio automático y aviso de cierre', async () => {
    await admin.put('/api/settings/email', { enabled: true }).expect(200);
    try {
      outbox().length = 0;
      const list = await newList(['a@tml.com.ar', 'b@tml.com.ar']);
      const { body: a } = await it_
        .post(
          '/api/announcements',
          announcement({
            systems: ['WMS', 'TMS'],
            details: 'Cerrar sesión en los handhelds antes de las 22.',
            reminderHours: 24,
            distributionListIds: [list.id],
          }),
        )
        .expect(201);
      await it_.post(`/api/announcements/${a.id}/send`).expect(200);
      expect(
        outbox()
          .map((m) => m.to)
          .sort(),
      ).toEqual(['a@tml.com.ar', 'b@tml.com.ar']);
      const notice = outbox()[0]!;
      expect(notice.subject).toMatch(/^\[TLI\] Actualización de WMS y TMS: /);
      expect(notice.text).toContain('Cerrar sesión en los handhelds');
      expect(notice.text).toContain('hora de Argentina');

      // Faltan 48 h: el recordatorio de 24 h todavía no sale.
      const service = ctx.app.get(AnnouncementsService);
      outbox().length = 0;
      await service.sendDueReminders();
      expect(outbox()).toHaveLength(0);
      // Se adelanta a dentro de 10 h: ahora sí, y una sola vez.
      await it_
        .patch(`/api/announcements/${a.id}`, {
          startsAt: new Date(Date.now() + 10 * HOUR).toISOString(),
          endsAt: new Date(Date.now() + 12 * HOUR).toISOString(),
        })
        .expect(200);
      await service.sendDueReminders();
      await service.sendDueReminders();
      expect(outbox()).toHaveLength(2);
      expect(outbox()[0]!.subject).toMatch(/^\[TLI\] Recordatorio: /);

      outbox().length = 0;
      const done = await it_
        .post(`/api/announcements/${a.id}/done`, { note: 'Quedó la versión 8.2.', notify: true })
        .expect(200);
      expect(done.body.status).toBe('DONE');
      expect(done.body.sends.map((s: { kind: string }) => s.kind)).toEqual([
        'DONE',
        'REMINDER',
        'NOTICE',
      ]);
      expect(outbox()).toHaveLength(2);
      expect(outbox()[0]!.text).toContain('Quedó la versión 8.2.');
      await it_.patch(`/api/announcements/${a.id}`, { title: 'Otro título' }).expect(400);
    } finally {
      await admin.put('/api/settings/email', { enabled: false }).expect(200);
    }
  });

  it('cancelar un borrador no manda nada y pide el motivo', async () => {
    const { body: a } = await it_.post('/api/announcements', announcement()).expect(201);
    await it_.post(`/api/announcements/${a.id}/cancel`, {}).expect(400);
    const res = await it_
      .post(`/api/announcements/${a.id}/cancel`, { note: 'Se pospone sin fecha' })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', sends: [] });
  });

  it('anonimizar a un titular saca su mail de las listas', async () => {
    const titular = await createUser(ctx, 'user');
    const list = await newList([titular.email, 'queda@tml.com.ar']);
    await admin.post(`/api/privacy/users/${titular.id}/anonymize`).expect(200);
    const after = await ctx.prisma.distributionList.findUniqueOrThrow({ where: { id: list.id } });
    expect(after.emails).toEqual(['queda@tml.com.ar']);
  });
});
