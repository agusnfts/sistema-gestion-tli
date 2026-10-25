import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createUser, loginAs, type Client, type TestContext } from './helpers';

let ctx: TestContext;
let user: Client;
let it_: Client;
let itId: string;

async function ticket(subject: string, type = 'SUPPORT') {
  const body =
    type === 'SUPPORT'
      ? {
          type,
          category: 'TMS',
          subject,
          description: 'Descripción del problema.',
          userUrgency: 'HIGH',
          extra: {},
        }
      : {
          type: 'AUTOMATION',
          category: 'WMS',
          subject,
          description: 'Hoy se hace a mano todos los días.',
          extra: {
            currentProcess: 'Se carga a mano desde un Excel.',
            frequency: 'DAILY',
            expectedBenefit: 'Ahorrar una hora por día',
          },
        };
  return (await user.post('/api/tickets', body).expect(201)).body as { id: string };
}

beforeAll(async () => {
  ctx = await createTestApp();
  user = await loginAs(ctx, await createUser(ctx, 'user'));
  const itUser = await createUser(ctx, 'it', { withMfa: true });
  itId = itUser.id;
  it_ = await loginAs(ctx, itUser);
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('dashboard', () => {
  it('el usuario común no lo ve', async () => {
    await user.get('/api/dashboard').expect(403);
  });

  it('cada número coincide con la lista filtrada a la que lleva', async () => {
    // Tickets asignados a un IT nuevo: así el dashboard filtrado solo cuenta estos.
    const a = await ticket('Remitos sin número de CAI');
    const b = await ticket('La hoja de ruta no imprime');
    const c = await ticket('Automatizar la carga de pedidos', 'AUTOMATION');
    for (const t of [a, b, c]) {
      await it_.patch(`/api/tickets/${t.id}`, { assigneeId: itId }).expect(200);
    }
    // Uno vencido (lo marca el monitor de SLA) y uno resuelto.
    await ctx.prisma.ticket.update({
      where: { id: a.id },
      data: { resolutionBreachAt: new Date(), resolutionDueAt: new Date(Date.now() - 3_600_000) },
    });
    await it_
      .post(`/api/tickets/${b.id}/status`, {
        status: 'RESOLVED',
        resolutionCause: 'Driver de la impresora',
        resolutionSolution: 'Se reinstaló el driver',
      })
      .expect(201);

    const d = await it_.get(`/api/dashboard?period=7d&owner=${itId}`).expect(200);
    const t = d.body.tickets;
    expect(t).toMatchObject({ open: 2, breached: 1, created: 3, done: 1 });
    expect(t.openByCategory).toEqual(
      expect.arrayContaining([
        { key: 'TMS', count: 1 },
        { key: 'WMS', count: 1 },
      ]),
    );
    expect(t.weekly).toHaveLength(8);
    expect(t.weekly.at(-1)).toMatchObject({ created: 3, done: 1 });
    expect(t.firstResponseOnTimePct).toBe(100);
    expect(d.body.proposals).toMatchObject({ received: 1, converted: 0 });

    // Drill-down: las mismas cuentas desde la bandeja.
    const list = (qs: string) =>
      it_.get(`/api/tickets?scope=all&assignee=${itId}&${qs}`).then((r) => r.body.total);
    expect(await list('state=open')).toBe(t.open);
    expect(await list('sla=breached&state=all')).toBe(t.breached);
    const { from, to } = d.body.range;
    expect(await list(`state=all&createdFrom=${from}&createdTo=${to}`)).toBe(t.created);
    expect(await list(`state=all&doneFrom=${from}&doneTo=${to}`)).toBe(t.done);
    expect(await list('state=open&category=TMS')).toBe(1);
  });

  it('mejoras, integraciones y clientes', async () => {
    await it_
      .post('/api/improvements', {
        title: 'Tablero de despacho en el TMS',
        system: 'TMS',
        currentSituation: 'Se sigue el despacho por WhatsApp.',
        proposal: 'Un tablero con el estado de cada hoja de ruta.',
      })
      .expect(201);
    const i = await it_
      .post('/api/integrations', {
        name: 'Seguimiento con Expreso Norte',
        counterpartType: 'CARRIER',
        counterpartName: 'Expreso Norte',
        processes: ['TRACKING'],
        systems: ['TMS'],
      })
      .expect(201);
    await it_.patch(`/api/integrations/${i.body.id}`, { targetDate: '2026-01-10' }).expect(200);

    const d = await it_.get('/api/dashboard?owner=me').expect(200);
    expect(d.body.improvements.activeBySystem).toEqual([{ key: 'TMS', count: 1 }]);
    expect(d.body.integrations).toMatchObject({ pending: 1, overdue: 1 });
    const overdue = await it_.get('/api/integrations?overdue=true&q=Expreso Norte').expect(200);
    expect(overdue.body.items.map((x: { id: string }) => x.id)).toContain(i.body.id);
    expect(Array.isArray(d.body.clients.byStatus)).toBe(true);
  });
});
