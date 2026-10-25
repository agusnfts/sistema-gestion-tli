import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestApp, createUser, loginAs, type Client, type TestContext } from './helpers';

let ctx: TestContext;
let user: Client;
let it_: Client;

// Palabra única por corrida para que la búsqueda no mezcle datos de otras corridas.
const tag = `ornitorrinco${randomUUID().slice(0, 6)}`;

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 40; i++) {
    const v = await fn();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return fn();
}

beforeAll(async () => {
  ctx = await createTestApp();
  user = await loginAs(ctx, await createUser(ctx, 'user'));
  it_ = await loginAs(ctx, await createUser(ctx, 'it', { withMfa: true }));
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('artículos', () => {
  it('borrador interno, después publicado y público: versiones, HTML sanitizado y búsqueda', async () => {
    await user
      .post('/api/knowledge/articles', { title: 'No debería', category: 'WMS' })
      .expect(403);
    const created = await it_
      .post('/api/knowledge/articles', {
        title: `Cómo reimprimir etiquetas ${tag}`,
        category: 'WMS',
        tags: ['Etiquetas', 'wms'],
        body: '<p>Entrá a <strong>Despacho</strong>.<script>alert(1)</script></p>',
      })
      .expect(201);
    const id = created.body.id;
    expect(created.body).toMatchObject({ status: 'DRAFT', visibility: 'INTERNAL', version: 1 });
    expect(created.body.code).toMatch(/^KB-\d{4}$/);
    expect(created.body.tags).toEqual(['etiquetas', 'wms']);
    expect(created.body.current.body).toBe('<p>Entrá a <strong>Despacho</strong>.</p>');

    // El usuario común no ve borradores ni internos.
    await user.get(`/api/knowledge/articles/${id}`).expect(404);

    const v2 = await it_
      .post(`/api/knowledge/articles/${id}/versions`, {
        title: `Cómo reimprimir etiquetas ${tag}`,
        body: '<p>Entrá a Despacho y elegí Reimprimir con la impresora de la isla.</p>',
        visibility: 'PUBLIC',
      })
      .expect(200);
    expect(v2.body.version).toBe(2);
    expect(v2.body.history.map((h: { version: number }) => h.version)).toEqual([2, 1]);

    await it_.post(`/api/knowledge/articles/${id}/status`, { status: 'PUBLISHED' }).expect(200);
    const asUser = await user.get(`/api/knowledge/articles/${id}`).expect(200);
    expect(asUser.body.history).toEqual([]);
    expect(asUser.body.canEdit).toBe(false);

    // Búsqueda sin acentos y con otra forma de la palabra.
    const found = await user.get(`/api/knowledge/search?q=reimprimiendo ${tag}`).expect(200);
    const hit = found.body.find((h: { id: string }) => h.id === id);
    expect(hit).toMatchObject({ source: 'ARTICLE', code: created.body.code });
    expect(hit.snippet).toContain('«');

    // Restaurar la versión 1 crea la versión 3 con aquel contenido.
    const restored = await it_
      .post(`/api/knowledge/articles/${id}/versions/${v2.body.history[1].id}/restore`)
      .expect(200);
    expect(restored.body.version).toBe(3);
    expect(restored.body.current.body).toContain('<strong>Despacho</strong>');
  });

  it('ficha de error generada desde un ticket', async () => {
    const t = await user
      .post('/api/tickets', {
        type: 'SUPPORT',
        category: 'WMS',
        subject: 'Error 504 al confirmar remito',
        description: 'Al confirmar el remito sale error 504.',
        userUrgency: 'HIGH',
        extra: {},
      })
      .expect(201);
    const a = await it_
      .post('/api/knowledge/articles', {
        title: 'Error 504 al confirmar remito',
        category: 'FREQUENT_ERRORS',
        template: 'ERROR_SHEET',
        errorSymptom: 'Sale error 504 al confirmar',
        errorCause: 'Timeout del servicio de remitos',
        errorSolution: 'Reintentar a los 2 minutos',
        sourceTicketId: t.body.id,
      })
      .expect(201);
    expect(a.body.template).toBe('ERROR_SHEET');
    expect(a.body.source.ticket.number).toBe(t.body.number);
  });
});

describe('biblioteca y búsqueda', () => {
  it('un documento de texto se extrae, se indexa y respeta la visibilidad', async () => {
    const up = await it_
      .upload(
        Buffer.from(
          `Procedimiento de inventario ${tag}.\n\nContar por ubicación y cerrar el ciclo.`,
        ),
        'inventario.txt',
      )
      .expect(201);
    const doc = await it_
      .post('/api/knowledge/documents', {
        title: 'Procedimiento de inventario',
        category: 'PROCEDURES',
        tags: ['inventario'],
        attachmentId: up.body.id,
      })
      .expect(201);
    const done = await waitFor(
      () => it_.get(`/api/knowledge/documents/${doc.body.id}`).then((r) => r.body),
      (d) => d.current?.extractionStatus === 'DONE',
    );
    expect(done.current.extractionStatus).toBe('DONE');

    const asIt = await it_.get(`/api/knowledge/search?q=${tag}`).expect(200);
    expect(asIt.body.map((h: { id: string }) => h.id)).toContain(doc.body.id);
    // Interno: el usuario no lo encuentra ni lo ve.
    const asUser = await user.get(`/api/knowledge/search?q=${tag}`).expect(200);
    expect(asUser.body.map((h: { id: string }) => h.id)).not.toContain(doc.body.id);
    await user.get(`/api/knowledge/documents/${doc.body.id}`).expect(404);

    // Al hacerlo público, aparece.
    await it_
      .patch(`/api/knowledge/documents/${doc.body.id}`, { visibility: 'PUBLIC' })
      .expect(200);
    const nowUser = await user.get(`/api/knowledge/search?q=inventario ${tag}`).expect(200);
    expect(nowUser.body.map((h: { id: string }) => h.id)).toContain(doc.body.id);
  });

  it('"Cómo funciona" de una integración se busca solo con permiso de integraciones', async () => {
    const i = await it_
      .post('/api/integrations', {
        name: `Stock ${tag}`,
        counterpartType: 'OTHER',
        counterpartName: 'Cliente Z',
        processes: ['STOCK'],
        systems: ['WMS'],
      })
      .expect(201);
    await it_
      .post(`/api/integrations/${i.body.id}/how-it-works`, {
        howItWorks: `<h3>Flujo</h3><p>El archivo de stock ${tag} se deja en la carpeta compartida.</p><img src="https://evil.example/x.png">`,
      })
      .expect(200);
    const res = await it_.get(`/api/knowledge/search?q=carpeta ${tag}`).expect(200);
    expect(res.body[0]).toMatchObject({ source: 'INTEGRATION', id: i.body.id });
    const asUser = await user.get(`/api/knowledge/search?q=carpeta ${tag}`).expect(200);
    expect(asUser.body).toEqual([]);
    const saved = await it_.get(`/api/integrations/${i.body.id}`).expect(200);
    expect(saved.body.howItWorks).not.toContain('evil.example');
  });

  it('los comentarios con HTML se sanitizan', async () => {
    const t = await user
      .post('/api/tickets', {
        type: 'SUPPORT',
        category: 'WMS',
        subject: 'Prueba de comentario con formato',
        description: 'Probando el editor de comentarios.',
        userUrgency: 'LOW',
        extra: {},
      })
      .expect(201);
    const r = await user
      .post(`/api/tickets/${t.body.id}/comments`, {
        body: '<p>Hola <em>IT</em><img src=x onerror=alert(1)></p>',
        visibility: 'PUBLIC',
      })
      .expect(201);
    expect(r.body.comments.at(-1).body).toBe('<p>Hola <em>IT</em></p>');
  });
});
