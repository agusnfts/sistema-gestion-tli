import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  createUser,
  loginAs,
  type Client,
  type TestContext,
  type TestUser,
} from './helpers';

// PNG mínimo (alcanza la firma para que pase la validación de tipo).
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

let ctx: TestContext;
let requester: TestUser;
let user: Client;
let it_: Client;

async function ticket(subject: string): Promise<{ id: string; number: string }> {
  const body = {
    type: 'AUTOMATION',
    category: 'WMS',
    subject,
    description: 'Hoy cargamos a mano los pedidos del cliente desde un Excel.',
    userUrgency: 'MEDIUM',
    extra: {
      currentProcess: 'Se tipea cada pedido desde el Excel del cliente.',
      frequency: 'DAILY',
      expectedBenefit: 'Ahorrar dos horas por día',
    },
  };
  return (await user.post('/api/tickets', body).expect(201)).body;
}

const proposal = (extra: Record<string, unknown> = {}) => ({
  title: 'Importar pedidos desde Excel en el WMS',
  system: 'WMS',
  currentSituation: 'Los pedidos se tipean uno por uno desde el Excel del cliente.',
  proposal: 'Agregar una importación de Excel con validación de SKUs.',
  impact: 3,
  effort: 1,
  ...extra,
});

beforeAll(async () => {
  ctx = await createTestApp();
  requester = await createUser(ctx, 'user');
  user = await loginAs(ctx, requester);
  it_ = await loginAs(ctx, await createUser(ctx, 'it', { withMfa: true }));
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('mejoras', () => {
  it('el usuario común no ve mejoras', async () => {
    await user.get('/api/improvements').expect(403);
    await user.post('/api/improvements', proposal()).expect(403);
  });

  it('IT crea una mejora desde tickets: se derivan, se implementa y se cierran con el mensaje', async () => {
    const t1 = await ticket('Automatizar la carga de pedidos de Excel');
    const t2 = await ticket('Carga de pedidos lleva toda la mañana');
    const created = await it_
      .post('/api/improvements', proposal({ ticketIds: [t1.id, t2.id] }))
      .expect(201);
    expect(created.body.code).toMatch(/^MEJ-\d{4}$/);
    expect(created.body.priority).toBe('HIGH');
    expect(created.body.ticketCount).toBe(2);

    // El ticket queda derivado, con el SLA detenido. El solicitante no ve la mejora.
    const asUser = await user.get(`/api/tickets/${t1.id}`).expect(200);
    expect(asUser.body.status).toBe('DERIVED_TO_IMPROVEMENT');
    expect(asUser.body.improvement).toBeNull();
    expect(asUser.body.comments.at(-1).body).toContain(created.body.code);
    const asIt = await it_.get(`/api/tickets/${t1.id}`).expect(200);
    expect(asIt.body.improvement.code).toBe(created.body.code);
    await user.get(`/api/improvements/${created.body.id}`).expect(403);

    // Kanban: avanza sin mensaje; para implementar hace falta el mensaje de cierre.
    await it_
      .post(`/api/improvements/${created.body.id}/status`, { status: 'IN_DEVELOPMENT' })
      .expect(200);
    await it_
      .post(`/api/improvements/${created.body.id}/status`, { status: 'IMPLEMENTED' })
      .expect(400);
    const message = 'Ya está la importación de Excel en el WMS: menú Pedidos → Importar.';
    const done = await it_
      .post(`/api/improvements/${created.body.id}/status`, {
        status: 'IMPLEMENTED',
        closingMessage: message,
      })
      .expect(200);
    expect(done.body.closedTickets).toBe(2);
    expect(done.body.improvement.completedAt).not.toBeNull();

    const closed = await user.get(`/api/tickets/${t2.id}`).expect(200);
    expect(closed.body.status).toBe('CLOSED');
    expect(closed.body.comments.at(-1).body).toBe(message);
    const n = await ctx.prisma.notification.count({
      where: { userId: requester.id, entityId: t2.id, kind: 'TICKET_STATUS_CHANGED' },
    });
    expect(n).toBeGreaterThanOrEqual(2);

    // Cerrada: no admite más cambios de estado ni tickets.
    await it_
      .post(`/api/improvements/${created.body.id}/status`, { status: 'TESTING' })
      .expect(400);
    const t3 = await ticket('Otro pedido de importación');
    await it_
      .post(`/api/improvements/${created.body.id}/tickets`, { ticketIds: [t3.id] })
      .expect(400);
  });

  it('desde un problema: vincula el problema y deriva sus tickets abiertos', async () => {
    const t1 = await ticket('Etiquetas de despacho manuales');
    const problem = await it_
      .post('/api/problems', {
        title: 'El WMS no genera etiquetas de despacho',
        description: 'Hay que armarlas a mano en Word para cada pedido.',
        category: 'WMS',
        ticketIds: [t1.id],
      })
      .expect(201);
    const created = await it_
      .post('/api/improvements', proposal({ problemIds: [problem.body.id], effort: 3, impact: 1 }))
      .expect(201);
    expect(created.body.priority).toBe('LOW');
    expect(created.body.problems.map((p: { id: string }) => p.id)).toEqual([problem.body.id]);
    expect(created.body.tickets.map((t: { id: string }) => t.id)).toEqual([t1.id]);

    const p = await it_.get(`/api/problems/${problem.body.id}`).expect(200);
    expect(p.body.improvements[0].code).toBe(created.body.code);
  });

  it('quitar un ticket lo devuelve a "En curso"; solo se derivan tickets abiertos', async () => {
    const t1 = await ticket('Reporte de stock automático');
    const created = await it_
      .post('/api/improvements', proposal({ ticketIds: [t1.id] }))
      .expect(201);
    await it_.delete(`/api/improvements/${created.body.id}/tickets/${t1.id}`).expect(200);
    const back = await it_.get(`/api/tickets/${t1.id}`).expect(200);
    expect(back.body.status).toBe('IN_PROGRESS');
    expect(back.body.improvement).toBeNull();

    await it_
      .post(`/api/tickets/${t1.id}/status`, {
        status: 'RESOLVED',
        resolutionCause: 'Ya existía el reporte',
        resolutionSolution: 'Se le mostró dónde está',
      })
      .expect(201);
    const res = await it_
      .post(`/api/improvements/${created.body.id}/tickets`, { ticketIds: [t1.id] })
      .expect(400);
    expect(res.body.message).toContain('abiertos');
  });

  it('prioridad manual, descarte con mensaje y comentarios internos', async () => {
    const t1 = await ticket('Integrar ruteo con TMS');
    const created = await it_
      .post('/api/improvements', proposal({ ticketIds: [t1.id] }))
      .expect(201);
    const id = created.body.id;

    const manual = await it_
      .patch(`/api/improvements/${id}`, {
        priority: 'CRITICAL',
        estimatedCost: 1500.5,
        currency: 'USD',
        targetDate: '2026-12-15',
      })
      .expect(200);
    expect(manual.body).toMatchObject({
      priority: 'CRITICAL',
      priorityIsManual: true,
      estimatedCost: 1500.5,
      currency: 'USD',
      targetDate: '2026-12-15',
    });
    // Cambiar el impacto no pisa la prioridad manual; null vuelve a la sugerida.
    const still = await it_.patch(`/api/improvements/${id}`, { impact: 1 }).expect(200);
    expect(still.body.priority).toBe('CRITICAL');
    const auto = await it_.patch(`/api/improvements/${id}`, { priority: null }).expect(200);
    expect(auto.body).toMatchObject({ priority: 'MEDIUM', priorityIsManual: false });

    // Acción con adjunto (ej. la cotización): la ve IT, el solicitante no puede bajarla.
    const quote = await it_.upload(PNG, 'cotizacion-sgl.png').expect(201);
    const logged = await it_
      .post(`/api/improvements/${id}/actions`, {
        body: 'Pedimos cotización a SGL.',
        attachmentIds: [quote.body.id],
      })
      .expect(200);
    expect(logged.body.actions).toHaveLength(1);
    expect(logged.body.actions[0].attachments[0]).toMatchObject({
      name: 'cotizacion-sgl.png',
      scanStatus: 'CLEAN',
    });
    await it_.get(`/api/attachments/${quote.body.id}`).expect(200);
    await user.get(`/api/attachments/${quote.body.id}`).expect(404);
    // Un adjunto ya usado no se puede volver a vincular.
    await it_
      .post(`/api/improvements/${id}/actions`, { body: 'Otra', attachmentIds: [quote.body.id] })
      .expect(400);

    const discarded = await it_
      .post(`/api/improvements/${id}/status`, {
        status: 'DISCARDED',
        closingMessage: 'No la hacemos: el TMS nuevo ya trae esta integración de serie.',
      })
      .expect(200);
    expect(discarded.body.closedTickets).toBe(1);
    const t = await ctx.prisma.ticket.findUniqueOrThrow({ where: { id: t1.id } });
    expect(t.closeReason).toBe('IMPROVEMENT');

    const list = await it_.get('/api/improvements?state=closed&q=' + created.body.code).expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toContain(id);
  });
});
