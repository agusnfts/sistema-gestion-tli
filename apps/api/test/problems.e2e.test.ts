import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createTestApp,
  createUser,
  loginAs,
  type Client,
  type TestContext,
  type TestUser,
} from './helpers';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

let ctx: TestContext;
let requester: TestUser;
let user: Client;
let it_: Client;

// Palabra única por corrida para que la similitud no mezcle datos de otras corridas.
const tag = `zebra${randomUUID().slice(0, 6)}`;

const support = (
  subject: string,
  description = 'La impresora de la isla no responde al confirmar.',
) => ({
  type: 'SUPPORT',
  category: 'WMS',
  subject,
  description,
  userUrgency: 'HIGH',
  extra: {},
});

async function ticket(
  subject: string,
  description?: string,
): Promise<{ id: string; number: string }> {
  return (await user.post('/api/tickets', support(subject, description)).expect(201)).body;
}

beforeAll(async () => {
  ctx = await createTestApp();
  requester = await createUser(ctx, 'user');
  user = await loginAs(ctx, requester);
  it_ = await loginAs(ctx, await createUser(ctx, 'it', { withMfa: true }));
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('problemas', () => {
  it('el usuario común no ve problemas', async () => {
    await user.get('/api/problems').expect(403);
  });

  it('IT crea un problema con tickets, lo resuelve y resuelve los tickets en bloque', async () => {
    const t1 = await ticket(`Impresora ${tag} no imprime etiquetas`);
    const t2 = await ticket(`Etiquetas ${tag} salen en blanco`);
    const created = await it_
      .post('/api/problems', {
        title: `Driver de impresoras ${tag} desactualizado`,
        description: 'Varias impresoras Zebra fallan desde la actualización de Windows.',
        category: 'HARDWARE',
        ticketIds: [t1.id, t2.id],
      })
      .expect(201);
    expect(created.body.code).toMatch(/^PRB-\d{4}$/);
    expect(created.body.ticketCount).toBe(2);
    expect(created.body.openTicketCount).toBe(2);

    // El ticket muestra el problema a IT pero no al solicitante.
    const asIt = await it_.get(`/api/tickets/${t1.id}`).expect(200);
    expect(asIt.body.problem.code).toBe(created.body.code);
    const asUser = await user.get(`/api/tickets/${t1.id}`).expect(200);
    expect(asUser.body.problem).toBeNull();

    // No se puede resolver sin solución.
    await it_.post(`/api/problems/${created.body.id}/status`, { status: 'RESOLVED' }).expect(400);

    await it_
      .patch(`/api/problems/${created.body.id}`, {
        rootCause: 'Driver incompatible con la última actualización',
        permanentSolution: 'Se instaló el driver 8.2 en todos los puestos',
      })
      .expect(200);
    const resolved = await it_
      .post(`/api/problems/${created.body.id}/status`, {
        status: 'RESOLVED',
        resolveTickets: true,
        message: 'Ya actualizamos el driver de las impresoras. Probá de nuevo.',
      })
      .expect(200);
    expect(resolved.body.resolvedTickets).toBe(2);
    expect(resolved.body.problem.status).toBe('RESOLVED');
    expect(resolved.body.problem.openTicketCount).toBe(0);

    const after = await user.get(`/api/tickets/${t1.id}`).expect(200);
    expect(after.body.status).toBe('RESOLVED');
    expect(after.body.resolutionSolution).toBe('Se instaló el driver 8.2 en todos los puestos');
    expect(after.body.comments.at(-1).body).toBe(
      'Ya actualizamos el driver de las impresoras. Probá de nuevo.',
    );
    const notes = await ctx.prisma.notification.findMany({
      where: { userId: requester.id, entityId: t1.id, kind: 'TICKET_STATUS_CHANGED' },
    });
    expect(notes.length).toBeGreaterThan(0);
  });

  it('vincular a otro problema mueve el ticket; desvincular lo libera', async () => {
    const t = await ticket(`Lector ${tag} no lee códigos`);
    const a = await it_
      .post('/api/problems', {
        title: `Problema A ${tag}`,
        description: 'Descripción del A',
        category: 'HARDWARE',
        ticketIds: [t.id],
      })
      .expect(201);
    const b = await it_
      .post('/api/problems', {
        title: `Problema B ${tag}`,
        description: 'Descripción del B',
        category: 'HARDWARE',
      })
      .expect(201);
    await it_.post(`/api/problems/${b.body.id}/tickets`, { ticketIds: [t.id] }).expect(200);
    expect((await it_.get(`/api/problems/${a.body.id}`).expect(200)).body.ticketCount).toBe(0);
    const unlinked = await it_.delete(`/api/problems/${b.body.id}/tickets/${t.id}`).expect(200);
    expect(unlinked.body.ticketCount).toBe(0);
    await it_.delete(`/api/problems/${b.body.id}/tickets/${t.id}`).expect(404);
  });

  it('lista y busca por título o código', async () => {
    const p = await it_
      .post('/api/problems', {
        title: `Caída del TMS ${tag}`,
        description: 'El TMS no responde por la tarde.',
        category: 'TMS',
      })
      .expect(201);
    const byTitle = await it_.get(`/api/problems?state=all&q=${tag}`).expect(200);
    expect(byTitle.body.items.some((x: { id: string }) => x.id === p.body.id)).toBe(true);
    const byCode = await it_.get(`/api/problems?state=all&q=${p.body.code}`).expect(200);
    expect(byCode.body.items.map((x: { id: string }) => x.id)).toEqual([p.body.id]);
  });
});

describe('sugerencia de similares', () => {
  it('sugiere tickets parecidos aunque cambien acentos y formas de las palabras', async () => {
    // Las corridas anteriores dejan tickets casi iguales que desplazan a estos del top 5.
    await ctx.prisma.ticket.deleteMany({
      where: {
        OR: [
          { subject: { startsWith: 'Falla la impresión de remitos' } },
          { subject: { startsWith: 'Error imprimiendo remito' } },
        ],
      },
    });
    const original = await ticket(
      `Falla la impresión de remitos ${tag}`,
      'Error al imprimir remitos en Pacheco.',
    );
    const parecido = await ticket(
      `Error imprimiendo remito ${tag}`,
      'No sale la impresion del remito.',
    );
    await ticket('Alta de usuario en el TMS', 'Necesito acceso para un operario nuevo.');
    const res = await it_.get(`/api/tickets/${original.id}/similar`).expect(200);
    const ids = res.body.tickets.map((t: { id: string }) => t.id);
    expect(ids).toContain(parecido.id);
    expect(ids).not.toContain(original.id);
  });

  it('sugiere problemas abiertos relacionados con el ticket', async () => {
    const p = await it_
      .post('/api/problems', {
        title: `Corte de red ${tag} en Garín`,
        description: 'Se cae la conexión de la red del depósito de Garín.',
        category: 'NETWORK',
      })
      .expect(201);
    const t = await ticket(`Sin red ${tag} en Garín`, 'Se cortó la conexión en el depósito.');
    const res = await it_.get(`/api/tickets/${t.id}/similar`).expect(200);
    expect(res.body.problems.map((x: { id: string }) => x.id)).toContain(p.body.id);
    const fromProblem = await it_.get(`/api/problems/${p.body.id}/suggestions`).expect(200);
    expect(fromProblem.body.tickets.map((x: { id: string }) => x.id)).toContain(t.id);
  });

  it('el usuario común no puede pedir similares', async () => {
    const t = await ticket(`Consulta ${tag}`);
    await user.get(`/api/tickets/${t.id}/similar`).expect(403);
  });

  it('IT registra acciones con adjuntos; el usuario común no puede ni verlas ni bajarlas', async () => {
    const created = await it_
      .post('/api/problems', {
        title: `Lentitud del WMS ${tag} a la mañana`,
        description: 'Entre las 8 y las 9 el WMS tarda más de 10 segundos en cada pantalla.',
        category: 'WMS',
      })
      .expect(201);
    const log = await it_.upload(PNG, 'grafico-cpu.png').expect(201);
    const res = await it_
      .post(`/api/problems/${created.body.id}/actions`, {
        body: 'Revisamos el servidor: CPU al 100 % por el backup nocturno que se extiende.',
        attachmentIds: [log.body.id],
      })
      .expect(200);
    expect(res.body.actions).toHaveLength(1);
    expect(res.body.actions[0].attachments[0].name).toBe('grafico-cpu.png');
    await it_.post(`/api/problems/${created.body.id}/actions`, { body: '' }).expect(400);

    await user.post(`/api/problems/${created.body.id}/actions`, { body: 'Hola' }).expect(403);
    await user.get(`/api/attachments/${log.body.id}`).expect(404);
    await it_.get(`/api/attachments/${log.body.id}`).expect(200);
  });
});
