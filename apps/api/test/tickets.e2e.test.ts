import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  createUser,
  loginAs,
  type Client,
  type TestContext,
  type TestUser,
} from './helpers';
import { SlaMonitorService } from '../src/tickets/sla-monitor.service';

let ctx: TestContext;
let requester: TestUser;
let user: Client;
let it_: Client;
let itUser: TestUser;
let otherUser: Client;

const incident = {
  type: 'SUPPORT',
  category: 'WMS',
  subject: 'No imprime etiquetas en Garín',
  description: 'Al confirmar el picking la impresora no responde.',
  userUrgency: 'HIGH',
  extra: { errorMessage: 'Timeout de impresora' },
};

beforeAll(async () => {
  ctx = await createTestApp();
  requester = await createUser(ctx, 'user');
  user = await loginAs(ctx, requester);
  itUser = await createUser(ctx, 'it', { withMfa: true });
  it_ = await loginAs(ctx, itUser);
  otherUser = await loginAs(ctx, await createUser(ctx, 'user'));
});

afterAll(async () => {
  await ctx?.app.close();
});

async function createTicket(body: object = incident): Promise<{ id: string; number: string }> {
  const res = await user.post('/api/tickets', body).expect(201);
  return res.body;
}

describe('alta de tickets', () => {
  it('el usuario crea un ticket con número TLI y prioridad provisoria igual a su urgencia', async () => {
    const { id, number } = await createTicket();
    expect(number).toMatch(/^TLI-\d{6}$/);
    const detail = await user.get(`/api/tickets/${id}`).expect(200);
    expect(detail.body.priority).toBe('HIGH');
    expect(detail.body.priorityIsProvisional).toBe(true);
    expect(detail.body.status).toBe('NEW');
    expect(detail.body.extraFields).toEqual({ errorMessage: 'Timeout de impresora' });
    expect(detail.body.sla.firstResponse.dueAt).toBeTruthy();
    expect(detail.body.canManage).toBe(false);
  });

  it('valida las preguntas propias de cada tipo', async () => {
    const res = await user
      .post('/api/tickets', {
        ...incident,
        type: 'AUTOMATION',
        extra: { frequency: 'DAILY' },
      })
      .expect(400);
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining(['extra.currentProcess', 'extra.expectedBenefit']),
    );
  });

  it('una propuesta solo tiene SLA de primera respuesta', async () => {
    const { id } = await createTicket({
      type: 'AUTOMATION',
      category: 'WMS',
      subject: 'Automatizar la carga de stock',
      description: 'Todos los días cargamos a mano el stock del cliente X.',
      extra: {
        currentProcess: 'Se copia el Excel del cliente al WMS a mano.',
        frequency: 'DAILY',
        minutesPerOccurrence: 45,
        expectedBenefit: 'Ahorrar 45 minutos diarios',
      },
    });
    const detail = await user.get(`/api/tickets/${id}`).expect(200);
    expect(detail.body.priority).toBe('LOW');
    expect(detail.body.sla.resolution.state).toBe('STOPPED');
    expect(detail.body.sla.resolution.dueAt).toBeNull();
  });

  it('IT recibe una notificación por cada ticket nuevo', async () => {
    const { number } = await createTicket();
    const list = await it_.get('/api/notifications').expect(200);
    expect(list.body.some((n: { title: string }) => n.title === `Nuevo ticket ${number}`)).toBe(
      true,
    );
  });
});

describe('visibilidad', () => {
  it('un usuario ve solo sus tickets y no puede ver los de otro', async () => {
    const { id } = await createTicket();
    await otherUser.get(`/api/tickets/${id}`).expect(404);
    const mine = await otherUser.get('/api/tickets?scope=mine&state=all').expect(200);
    expect(mine.body.items.find((t: { id: string }) => t.id === id)).toBeUndefined();
    await otherUser.get('/api/tickets?scope=all').expect(403);
  });

  it('el usuario no ve comentarios internos ni puede escribirlos', async () => {
    const { id } = await createTicket();
    await it_
      .post(`/api/tickets/${id}/comments`, {
        body: 'Nota interna: revisar driver',
        visibility: 'INTERNAL',
      })
      .expect(201);
    await it_
      .post(`/api/tickets/${id}/comments`, {
        body: 'Estamos revisando la impresora',
        visibility: 'PUBLIC',
      })
      .expect(201);
    const asUser = await user.get(`/api/tickets/${id}`).expect(200);
    expect(asUser.body.comments.map((c: { body: string }) => c.body)).toEqual([
      'Estamos revisando la impresora',
    ]);
    expect(asUser.body.timeEntries).toBeNull();
    await user
      .post(`/api/tickets/${id}/comments`, { body: 'x', visibility: 'INTERNAL' })
      .expect(403);
    const asIt = await it_.get(`/api/tickets/${id}`).expect(200);
    expect(asIt.body.comments).toHaveLength(2);
  });

  it('el usuario no puede gestionar tickets', async () => {
    const { id } = await createTicket();
    await user.patch(`/api/tickets/${id}`, { priority: 'LOW' }).expect(403);
    await user.post(`/api/tickets/${id}/status`, { status: 'IN_PROGRESS' }).expect(403);
  });
});

describe('gestión por IT', () => {
  it('asignar pasa el ticket a "Asignado" y avisa al asignado y al solicitante', async () => {
    const { id } = await createTicket();
    const res = await it_.patch(`/api/tickets/${id}`, { assigneeId: itUser.id }).expect(200);
    expect(res.body.status).toBe('ASSIGNED');
    expect(res.body.assignee.id).toBe(itUser.id);
    const notif = await user.get('/api/notifications').expect(200);
    expect(
      notif.body.some(
        (n: { kind: string; link: string }) =>
          n.kind === 'TICKET_STATUS_CHANGED' && n.link === `/tickets/${id}`,
      ),
    ).toBe(true);
  });

  it('no se puede asignar a alguien que no es de IT', async () => {
    const { id } = await createTicket();
    await it_.patch(`/api/tickets/${id}`, { assigneeId: requester.id }).expect(400);
  });

  it('IT fija la prioridad (deja de ser provisoria) y se recalculan los vencimientos', async () => {
    const { id } = await createTicket();
    const before = await it_.get(`/api/tickets/${id}`).expect(200);
    const res = await it_.patch(`/api/tickets/${id}`, { priority: 'CRITICAL' }).expect(200);
    expect(res.body.priorityIsProvisional).toBe(false);
    expect(
      new Date(res.body.sla.resolution.dueAt) < new Date(before.body.sla.resolution.dueAt),
    ).toBe(true);
  });

  it('la primera respuesta pública de IT cumple el SLA de primera respuesta', async () => {
    const { id } = await createTicket();
    const res = await it_
      .post(`/api/tickets/${id}/comments`, { body: 'Lo estamos mirando', visibility: 'PUBLIC' })
      .expect(201);
    expect(res.body.firstRespondedAt).toBeTruthy();
    expect(res.body.sla.firstResponse.state).toBe('MET');
  });

  it('respeta las transiciones permitidas y exige causa y solución para resolver', async () => {
    const { id } = await createTicket();
    await it_.post(`/api/tickets/${id}/status`, { status: 'CLOSED' }).expect(400);
    const noCause = await it_.post(`/api/tickets/${id}/status`, { status: 'RESOLVED' }).expect(400);
    expect(noCause.body.issues.map((i: { path: string }) => i.path)).toEqual([
      'resolutionCause',
      'resolutionSolution',
    ]);
    const resolved = await it_
      .post(`/api/tickets/${id}/status`, {
        status: 'RESOLVED',
        resolutionCause: 'Driver viejo',
        resolutionSolution: 'Se actualizó el driver',
      })
      .expect(201);
    expect(resolved.body.status).toBe('RESOLVED');
    expect(resolved.body.allowedTransitions).toEqual(['IN_PROGRESS', 'CLOSED']);
  });

  it('"Esperando usuario" pausa el SLA y la respuesta del usuario lo reanuda', async () => {
    const { id } = await createTicket();
    const paused = await it_
      .post(`/api/tickets/${id}/status`, { status: 'WAITING_USER' })
      .expect(201);
    expect(paused.body.sla.resolution.state).toBe('PAUSED');
    const reply = await user
      .post(`/api/tickets/${id}/comments`, { body: 'Ya reinicié la impresora' })
      .expect(201);
    expect(reply.body.status).toBe('IN_PROGRESS');
    expect(reply.body.sla.resolution.state).not.toBe('PAUSED');
  });

  it('si el usuario responde un ticket resuelto, se reabre', async () => {
    const { id } = await createTicket();
    await it_
      .post(`/api/tickets/${id}/status`, {
        status: 'RESOLVED',
        resolutionCause: 'x causa',
        resolutionSolution: 'y solución',
      })
      .expect(201);
    const reply = await user
      .post(`/api/tickets/${id}/comments`, { body: 'Sigue fallando' })
      .expect(201);
    expect(reply.body.status).toBe('IN_PROGRESS');
    expect(reply.body.resolvedAt).toBeNull();
  });

  it('un ticket cerrado no acepta comentarios', async () => {
    const { id } = await createTicket();
    await it_
      .post(`/api/tickets/${id}/status`, {
        status: 'RESOLVED',
        resolutionCause: 'abc',
        resolutionSolution: 'def',
      })
      .expect(201);
    await it_.post(`/api/tickets/${id}/status`, { status: 'CLOSED' }).expect(201);
    await user.post(`/api/tickets/${id}/comments`, { body: '¿Sigue?' }).expect(400);
  });

  it('registra tiempo invertido (solo IT lo ve)', async () => {
    const { id } = await createTicket();
    const res = await it_
      .post(`/api/tickets/${id}/time`, { minutes: 45, note: 'Diagnóstico' })
      .expect(201);
    expect(res.body.totalMinutes).toBe(45);
    await user.post(`/api/tickets/${id}/time`, { minutes: 10 }).expect(403);
  });

  it('la bandeja de IT filtra por asignado y por estado', async () => {
    const { id } = await createTicket();
    await it_.patch(`/api/tickets/${id}`, { assigneeId: itUser.id }).expect(200);
    const mine = await it_.get('/api/tickets?scope=all&assignee=me').expect(200);
    expect(mine.body.items.some((t: { id: string }) => t.id === id)).toBe(true);
    const search = await it_
      .get(`/api/tickets?scope=all&state=all&q=${encodeURIComponent('etiquetas')}`)
      .expect(200);
    expect(search.body.total).toBeGreaterThan(0);
  });
});

describe('monitor de SLA', () => {
  it('marca vencidos y avisa al asignado una sola vez', async () => {
    const { id } = await createTicket();
    await it_.patch(`/api/tickets/${id}`, { assigneeId: itUser.id }).expect(200);
    const monitor = ctx.app.get(SlaMonitorService);
    // Se corre el monitor "en el futuro" para forzar el vencimiento.
    const future = new Date(Date.now() + 30 * 24 * 3600_000);
    await monitor.runOnce(future);
    await monitor.runOnce(future);
    const t = await ctx.prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(t.firstResponseBreachAt).not.toBeNull();
    expect(t.resolutionBreachAt).not.toBeNull();
    const notes = await ctx.prisma.notification.findMany({
      where: { userId: itUser.id, entityId: id, kind: 'TICKET_SLA_BREACHED' },
    });
    expect(notes).toHaveLength(2);
    const breached = await it_.get('/api/tickets?scope=all&sla=breached').expect(200);
    expect(breached.body.items.some((x: { id: string }) => x.id === id)).toBe(true);
  });
});

describe('notificaciones', () => {
  it('marca como leídas', async () => {
    const before = await it_.get('/api/notifications/unread-count').expect(200);
    expect(before.body.count).toBeGreaterThan(0);
    await it_.post('/api/notifications/read-all').expect(204);
    const after = await it_.get('/api/notifications/unread-count').expect(200);
    expect(after.body.count).toBe(0);
  });
});

describe('configuración', () => {
  let admin: Client;
  beforeAll(async () => {
    admin = await loginAs(ctx, await createUser(ctx, 'admin', { withMfa: true }));
  });

  it('solo Admin edita el SLA; IT no', async () => {
    const sla = await admin.get('/api/settings/sla').expect(200);
    expect(sla.body.support.CRITICAL.firstResponseMinutes).toBeGreaterThan(0);
    await it_.get('/api/settings/sla').expect(403);
    await admin.put('/api/settings/sla', sla.body).expect(200);
  });

  it('valida el horario hábil', async () => {
    await admin
      .put('/api/settings/business-hours', { timezone: 'America/Argentina/Buenos_Aires', days: {} })
      .expect(400);
    await admin
      .put('/api/settings/business-hours', {
        timezone: 'America/Argentina/Buenos_Aires',
        days: { 1: { start: '17:00', end: '08:00' } },
      })
      .expect(400);
  });

  it('alta y baja de feriados, sin duplicados', async () => {
    const date = `2031-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}`;
    const created = await admin
      .post('/api/settings/holidays', { date, name: 'Feriado de prueba' })
      .expect(201);
    await admin.post('/api/settings/holidays', { date, name: 'Otro' }).expect(409);
    await admin.delete(`/api/settings/holidays/${created.body.id}`).expect(204);
  });
});

describe('sector e integraciones', () => {
  it('el ticket se asocia a un área o a un depósito, no a los dos', async () => {
    const area = await ctx.prisma.area.upsert({
      where: { name: 'Calidad' },
      create: { name: 'Calidad' },
      update: {},
    });
    const warehouse = await ctx.prisma.warehouse.findFirstOrThrow();
    await user
      .post('/api/tickets', { ...incident, areaId: area.id, warehouseId: warehouse.id })
      .expect(400);
    const { id } = await createTicket({ ...incident, category: 'ROUTING', areaId: area.id });
    const detail = await user.get(`/api/tickets/${id}`).expect(200);
    expect(detail.body.area).toEqual({ id: area.id, name: 'Calidad' });
    expect(detail.body.warehouse).toBeNull();
    expect(detail.body.category).toBe('ROUTING');
  });

  it('sin sector elegido, el ticket queda sin depósito ni área', async () => {
    const { id } = await createTicket({ ...incident, category: 'TYT' });
    const detail = await user.get(`/api/tickets/${id}`).expect(200);
    expect(detail.body.warehouse).toBeNull();
    expect(detail.body.area).toBeNull();
  });

  it('un pedido de integración (con un expreso) tiene categoría fija', async () => {
    const body = {
      type: 'INTEGRATION',
      category: 'WMS',
      subject: 'Integrar remitos con Expreso Sur',
      description: 'El expreso quiere recibir los remitos por archivo.',
      extra: {
        counterpartType: 'CARRIER',
        counterpartName: 'Expreso Sur',
        process: 'DELIVERY_NOTES',
        direction: 'OUTBOUND',
      },
    };
    // Con otra categoría, se rechaza.
    await user.post('/api/tickets', body).expect(400);
    const { id } = await createTicket({ ...body, category: undefined });
    const detail = await it_.get(`/api/tickets/${id}`).expect(200);
    expect(detail.body.category).toBe('INTEGRATION');
    expect(detail.body.extraFields.counterpartType).toBe('CARRIER');
    await it_.patch(`/api/tickets/${id}`, { category: 'WMS' }).expect(400);
  });
});

describe('categorías por tipo', () => {
  const proposal = {
    type: 'AUTOMATION',
    subject: 'Automatizar el alta de usuarios',
    description: 'Se hace todo a mano y lleva mucho tiempo.',
    extra: {
      currentProcess: 'Se completa una planilla y se carga a mano.',
      frequency: 'WEEKLY',
      expectedBenefit: 'Ahorrar tiempo',
    },
  };

  it('una propuesta no admite categorías de soporte como Accesos o Hardware', async () => {
    const res = await user.post('/api/tickets', { ...proposal, category: 'ACCESS' }).expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toContain('category');
    await user.post('/api/tickets', { ...proposal, category: 'TYT' }).expect(201);
  });

  it('IT no puede cambiar a una categoría que no corresponde al tipo', async () => {
    const { id } = await createTicket({ ...proposal, category: 'WMS' });
    await it_.patch(`/api/tickets/${id}`, { category: 'HARDWARE' }).expect(400);
    const ok = await it_.patch(`/api/tickets/${id}`, { category: 'ROUTING' }).expect(200);
    expect(ok.body.category).toBe('ROUTING');
  });
});

describe('tickets de acceso', () => {
  const access = {
    type: 'ACCESS',
    category: 'WMS',
    subject: 'Alta de usuario en el WMS',
    description: 'Necesita el mismo perfil que el resto del equipo de recepción.',
    userUrgency: 'HIGH',
    extra: { accessAction: 'NEW', forWhom: 'Juana Gómez' },
  };

  it('pide qué acceso y para quién, y tiene SLA de resolución', async () => {
    const bad = await user.post('/api/tickets', { ...access, extra: {} }).expect(400);
    expect(bad.body.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['extra.accessAction', 'extra.forWhom']),
    );
    const { id } = await createTicket(access);
    const detail = await user.get(`/api/tickets/${id}`).expect(200);
    expect(detail.body.type).toBe('ACCESS');
    expect(detail.body.sla.resolution.dueAt).toBeTruthy();
  });

  it('en un acceso la categoría es el sistema, no "Hardware"', async () => {
    await user.post('/api/tickets', { ...access, category: 'HARDWARE' }).expect(400);
  });
});
