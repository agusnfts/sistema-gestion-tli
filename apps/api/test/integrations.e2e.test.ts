import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomInt } from 'node:crypto';
import { normalizeCuit } from '@tli/shared';
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

/** CUIT válido al azar (cada corrida usa uno distinto: el CUIT es único). */
function randomCuit(): string {
  for (;;) {
    const base = `30${String(randomInt(0, 99_999_999)).padStart(8, '0')}`;
    for (let d = 0; d <= 9; d++) {
      const c = normalizeCuit(`${base}${d}`);
      if (c) return c;
    }
  }
}

async function integrationTicket(): Promise<{ id: string; number: string }> {
  const body = {
    type: 'INTEGRATION',
    subject: 'Recibir pedidos de Cliente X por FTP',
    description: 'El cliente quiere mandar los pedidos de salida en un CSV por FTP.',
    extra: {
      counterpartType: 'CLIENT',
      counterpartName: 'Cliente X',
      processes: ['OUTBOUND_ORDERS'],
      direction: 'INBOUND',
    },
  };
  return (await user.post('/api/tickets', body).expect(201)).body;
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

describe('clientes', () => {
  it('el usuario común no accede al maestro de clientes ni a integraciones', async () => {
    await user.get('/api/clients').expect(403);
    await user.get('/api/integrations').expect(403);
  });

  it('IT da de alta un cliente con CUIT validado, contactos y depósitos', async () => {
    const warehouse = await ctx.prisma.warehouse.findFirstOrThrow();
    const cuit = randomCuit();
    await it_.post('/api/clients', { legalName: 'Mal SA', cuit: '30-11111111-0' }).expect(400);
    const created = await it_
      .post('/api/clients', {
        legalName: 'Cliente Prueba SA',
        shortName: 'Prueba',
        cuit: `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`,
        warehouseIds: [warehouse.id],
      })
      .expect(201);
    expect(created.body.cuit).toBe(cuit);
    expect(created.body.warehouses.map((w: { id: string }) => w.id)).toEqual([warehouse.id]);
    await it_.post('/api/clients', { legalName: 'Duplicado SA', cuit }).expect(409);

    const withContact = await it_
      .post(`/api/clients/${created.body.id}/contacts`, {
        kind: 'SYSTEMS',
        name: 'Ana Sistemas',
        email: 'ANA@cliente.com',
      })
      .expect(200);
    expect(withContact.body.contacts[0]).toMatchObject({
      kind: 'SYSTEMS',
      email: 'ana@cliente.com',
    });

    const found = await it_.get(`/api/clients?q=${cuit.slice(2, 8)}`).expect(200);
    expect(found.body.items.map((c: { id: string }) => c.id)).toContain(created.body.id);
  });
});

describe('integraciones', () => {
  it('desde un pedido de integración: deriva el ticket, cotiza, documenta y al finalizar lo cierra', async () => {
    const client = await it_
      .post('/api/clients', { legalName: 'Integra SA', cuit: randomCuit() })
      .expect(201);
    const ticket = await integrationTicket();

    // Con cliente hace falta elegirlo del maestro.
    await it_
      .post('/api/integrations', {
        name: 'Pedidos por FTP',
        counterpartType: 'CLIENT',
        processes: ['OUTBOUND_ORDERS'],
        systems: ['WMS'],
      })
      .expect(400);
    const created = await it_
      .post('/api/integrations', {
        name: 'Pedidos por FTP',
        counterpartType: 'CLIENT',
        clientId: client.body.id,
        processes: ['OUTBOUND_ORDERS'],
        systems: ['WMS'],
        direction: 'INBOUND',
        channel: 'FTP_SFTP',
        format: 'CSV',
        ticketIds: [ticket.id],
      })
      .expect(201);
    const id = created.body.id;
    expect(created.body).toMatchObject({
      status: 'PENDING_SURVEY',
      counterpartLabel: 'Integra SA',
      ticketCount: 1,
    });
    expect(created.body.howItWorks).toContain('<h3>Origen y destino</h3>');

    const asUser = await user.get(`/api/tickets/${ticket.id}`).expect(200);
    expect(asUser.body.status).toBe('DERIVED_TO_INTEGRATION');
    expect(asUser.body.integration).toBeNull();
    const asIt = await it_.get(`/api/tickets/${ticket.id}`).expect(200);
    expect(asIt.body.integration.code).toBe(created.body.code);

    // "Cómo funciona" con historial.
    const how = await it_
      .post(`/api/integrations/${id}/how-it-works`, {
        howItWorks: 'Flujo: el cliente deja el CSV en /in cada 15 minutos.',
      })
      .expect(200);
    expect(how.body.howItWorks).toContain('cada 15 minutos');
    expect(how.body.revisions[0].howItWorks).toContain('<h3>Origen y destino</h3>');

    // Dos cotizaciones; la elegida define el costo estimado.
    const providers = await ctx.prisma.provider.findMany({ take: 2, orderBy: { name: 'asc' } });
    const pdf = await it_.upload(PNG, 'cotizacion.png').expect(201);
    await it_
      .post(`/api/integrations/${id}/quotes`, {
        providerId: providers[0]!.id,
        amount: 1200,
        currency: 'USD',
        quotedAt: '2026-10-20',
        attachmentIds: [pdf.body.id],
      })
      .expect(200);
    const two = await it_
      .post(`/api/integrations/${id}/quotes`, {
        providerId: providers[1]!.id,
        amount: 900000,
        currency: 'ARS',
        quotedAt: '2026-10-21',
      })
      .expect(200);
    expect(two.body.estimatedCost).toBeNull();
    const cheaper = two.body.quotes.find((q: { amount: number }) => q.amount === 1200);
    const selected = await it_
      .post(`/api/integrations/${id}/quotes/select`, { quoteId: cheaper.id })
      .expect(200);
    expect(selected.body.estimatedCost).toEqual({ amount: 1200, currency: 'USD' });
    expect(cheaper.attachments[0].name).toBe('cotizacion.png');
    await user.get(`/api/attachments/${pdf.body.id}`).expect(404);

    // Documento con dos versiones.
    const v1 = await it_.upload(PNG, 'layout-v1.png').expect(201);
    const withDoc = await it_
      .post(`/api/integrations/${id}/documents`, {
        title: 'Layout de pedidos',
        linkType: 'LAYOUT',
        attachmentId: v1.body.id,
      })
      .expect(200);
    const doc = withDoc.body.documents[0];
    expect(doc).toMatchObject({ title: 'Layout de pedidos', linkType: 'LAYOUT' });
    const v2 = await it_.upload(PNG, 'layout-v2.png').expect(201);
    await it_
      .post(`/api/documents/${doc.id}/versions`, { attachmentId: v2.body.id, note: 'Campo lote' })
      .expect(204);
    await user.post(`/api/documents/${doc.id}/versions`, { attachmentId: v2.body.id }).expect(403);
    const after = await it_.get(`/api/integrations/${id}`).expect(200);
    expect(after.body.documents[0].current).toMatchObject({ version: 2, note: 'Campo lote' });
    expect(after.body.documents[0].versions).toHaveLength(2);
    await it_.get(`/api/attachments/${v1.body.id}`).expect(200);
    await user.get(`/api/attachments/${v2.body.id}`).expect(404);

    // La ficha del cliente muestra la integración pendiente.
    const fromClient = await it_.get(`/api/clients/${client.body.id}`).expect(200);
    expect(fromClient.body.pendingIntegrationCount).toBe(1);
    expect(fromClient.body.integrations[0].id).toBe(id);

    // Finalizar exige mensaje de cierre y cierra el ticket derivado.
    await it_.post(`/api/integrations/${id}/status`, { status: 'IN_DEVELOPMENT' }).expect(200);
    await it_.post(`/api/integrations/${id}/status`, { status: 'COMPLETED' }).expect(400);
    const message = 'La integración por FTP ya está funcionando: los pedidos entran solos al WMS.';
    const done = await it_
      .post(`/api/integrations/${id}/status`, { status: 'COMPLETED', closingMessage: message })
      .expect(200);
    expect(done.body.closedTickets).toBe(1);
    expect(done.body.integration.goLiveDate).not.toBeNull();
    const closed = await user.get(`/api/tickets/${ticket.id}`).expect(200);
    expect(closed.body.status).toBe('CLOSED');
    expect(closed.body.comments.at(-1).body).toBe(message);
  });

  it('con un expreso: nombre libre; "No realizada" exige motivo', async () => {
    const created = await it_
      .post('/api/integrations', {
        name: 'Seguimiento con Expreso Sur',
        counterpartType: 'CARRIER',
        counterpartName: 'Expreso Sur',
        processes: ['TRACKING'],
        systems: ['TMS'],
      })
      .expect(201);
    expect(created.body.counterpartLabel).toBe('Expreso Sur');
    const id = created.body.id;
    const closing = 'No avanzamos: el expreso no tiene forma de enviarnos los datos.';
    await it_
      .post(`/api/integrations/${id}/status`, { status: 'NOT_DONE', closingMessage: closing })
      .expect(400);
    const res = await it_
      .post(`/api/integrations/${id}/status`, {
        status: 'NOT_DONE',
        notDoneReason: 'OTHER',
        notDoneNotes: 'Sin API ni FTP',
        closingMessage: closing,
      })
      .expect(200);
    expect(res.body.integration).toMatchObject({ status: 'NOT_DONE', notDoneReason: 'OTHER' });
    const pending = await it_.get('/api/integrations?state=pending&q=Expreso Sur').expect(200);
    expect(pending.body.items.map((i: { id: string }) => i.id)).not.toContain(id);
  });

  it('acciones con adjuntos y quitar un ticket lo devuelve a "En curso"', async () => {
    const ticket = await integrationTicket();
    const created = await it_
      .post('/api/integrations', {
        name: 'Stock a Cliente Y',
        counterpartType: 'OTHER',
        counterpartName: 'Cliente Y (sin alta)',
        processes: ['STOCK'],
        systems: ['WMS'],
        ticketIds: [ticket.id],
      })
      .expect(201);
    const minuta = await it_.upload(PNG, 'minuta.png').expect(201);
    const logged = await it_
      .post(`/api/integrations/${created.body.id}/actions`, {
        body: 'Reunión de relevamiento con sistemas del cliente.',
        attachmentIds: [minuta.body.id],
      })
      .expect(200);
    expect(logged.body.actions[0].attachments[0].name).toBe('minuta.png');

    await it_.delete(`/api/integrations/${created.body.id}/tickets/${ticket.id}`).expect(200);
    const back = await it_.get(`/api/tickets/${ticket.id}`).expect(200);
    expect(back.body.status).toBe('IN_PROGRESS');
    expect(back.body.integration).toBeNull();
  });

  it('varios procesos, varios sistemas y plataformas del catálogo (e-commerce, ERP)', async () => {
    const platforms = await it_.get('/api/catalogs/platforms').expect(200);
    const meli = platforms.body.find((p: { name: string }) => p.name === 'Mercado Libre');
    const sap = platforms.body.find((p: { name: string }) => p.name === 'SAP');
    expect(meli.category).toBe('ECOMMERCE');
    expect(sap.category).toBe('ERP');

    await it_
      .post('/api/integrations', {
        name: 'Sin procesos',
        counterpartType: 'OTHER',
        counterpartName: 'X',
        processes: [],
        systems: ['WMS'],
      })
      .expect(400);
    const created = await it_
      .post('/api/integrations', {
        name: 'Tienda online completa',
        counterpartType: 'OTHER',
        counterpartName: 'Marca Z',
        processes: ['OUTBOUND_ORDERS', 'STOCK', 'TRACKING', 'STOCK'],
        systems: ['WMS', 'TMS'],
        platformIds: [meli.id, sap.id],
      })
      .expect(201);
    expect(created.body.processes).toEqual(['OUTBOUND_ORDERS', 'STOCK', 'TRACKING']);
    expect(created.body.systems).toEqual(['WMS', 'TMS']);
    expect(created.body.platforms.map((p: { name: string }) => p.name).sort()).toEqual([
      'Mercado Libre',
      'SAP',
    ]);

    const byPlatform = await it_
      .get(`/api/integrations?state=all&platformId=${sap.id}`)
      .expect(200);
    expect(byPlatform.body.items.map((i: { id: string }) => i.id)).toContain(created.body.id);
    const bySystem = await it_.get('/api/integrations?state=all&system=TMS').expect(200);
    expect(bySystem.body.items.map((i: { id: string }) => i.id)).toContain(created.body.id);

    const updated = await it_
      .patch(`/api/integrations/${created.body.id}`, { platformIds: [meli.id], systems: ['WMS'] })
      .expect(200);
    expect(updated.body.platforms.map((p: { name: string }) => p.name)).toEqual(['Mercado Libre']);
    expect(updated.body.systems).toEqual(['WMS']);
  });

  it('el catálogo de plataformas se edita con categoría', async () => {
    const admin = await loginAs(ctx, await createUser(ctx, 'admin', { withMfa: true }));
    const name = `VTEX ${Date.now()}`;
    const res = await admin
      .post('/api/catalogs/platforms', { name, category: 'ECOMMERCE' })
      .expect(201);
    expect(res.body).toMatchObject({ name, category: 'ECOMMERCE', active: true });
    // En los otros catálogos la categoría no aplica.
    const area = await admin
      .post('/api/catalogs/areas', { name: `Área ${Date.now()}`, category: 'ERP' })
      .expect(201);
    expect(area.body.category).toBeUndefined();
  });
});
