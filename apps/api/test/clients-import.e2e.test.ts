import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, createUser, loginAs, type Client, type TestContext } from './helpers';

// Planilla con datos ficticios que imita los encabezados del F50 real.
const F50 = readFileSync(join(__dirname, 'fixtures', 'f50-ficticio.xlsx'));
const FOLIOS = ['F-901', 'F-902', 'F-903'];
const CUITS = ['30500010912', '20123456786'];

let ctx: TestContext;
let admin: Client;

beforeAll(async () => {
  ctx = await createTestApp();
  // El fixture usa CUIT y folios fijos: se limpian los de corridas anteriores.
  await ctx.prisma.client.deleteMany({
    where: { OR: [{ f50Folio: { in: FOLIOS } }, { cuit: { in: CUITS } }] },
  });
  admin = await loginAs(ctx, await createUser(ctx, 'admin', { withMfa: true }));
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('importación del F50', () => {
  it('un usuario común no importa; un archivo que no es Excel se rechaza', async () => {
    const user = await loginAs(ctx, await createUser(ctx, 'user'));
    await user.upload(F50, 'f50.xlsx', '/api/clients/import').expect(403);
    await admin.upload(Buffer.from('hola,chau'), 'f50.xlsx', '/api/clients/import').expect(400);
  });

  it('previsualiza sin escribir, importa y es idempotente', async () => {
    const preview = await admin.upload(F50, 'f50.xlsx', '/api/clients/import').expect(200);
    expect(preview.body).toMatchObject({
      dryRun: true,
      sheet: 'Respuestas de formulario 1',
      totals: { create: 3, update: 0, skip: 0, contacts: 4 },
    });
    const bad = preview.body.rows.find((r: { folio: string }) => r.folio === 'F-903');
    expect(bad.warnings[0]).toMatch(/CUIT inválido/);
    expect(await ctx.prisma.client.count({ where: { f50Folio: { in: FOLIOS } } })).toBe(0);

    const done = await admin
      .upload(F50, 'f50.xlsx', '/api/clients/import?dryRun=false')
      .expect(200);
    expect(done.body.totals).toMatchObject({ create: 3, contacts: 4 });

    const uno = await ctx.prisma.client.findUniqueOrThrow({
      where: { cuit: '30500010912' },
      include: { contacts: { orderBy: { name: 'asc' } } },
    });
    expect(uno).toMatchObject({
      legalName: 'Ficticia Uno S.A.',
      f50Folio: 'F-901',
      status: 'ACTIVE',
      address: 'Calle Falsa 123 · Garín, CP 1619, Buenos Aires',
    });
    expect(uno.notes).toContain('Distribución: CABA, AMBA');
    expect(uno.contacts.map((c) => [c.role, c.name, c.email])).toEqual([
      ['Operaciones', 'Ana Pérez', 'ana@ficticia.com'],
      ['Facturación', 'Juan Gómez', 'juan@ficticia.com'],
      ['Facturación', 'Sol Ruiz', 'sol@ficticia.com'],
    ]);
    const dos = await ctx.prisma.client.findUniqueOrThrow({ where: { f50Folio: 'F-902' } });
    expect(dos).toMatchObject({ cuit: '20123456786', status: 'INACTIVE' });
    const mal = await ctx.prisma.client.findUniqueOrThrow({ where: { f50Folio: 'F-903' } });
    expect(mal.cuit).toBeNull();

    // Segunda vez: nada nuevo, no duplica.
    const again = await admin
      .upload(F50, 'f50.xlsx', '/api/clients/import?dryRun=false')
      .expect(200);
    expect(again.body.totals).toMatchObject({ create: 0, update: 0, skip: 3, contacts: 0 });
    expect(await ctx.prisma.client.count({ where: { f50Folio: { in: FOLIOS } } })).toBe(3);

    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'client.imported' },
      orderBy: { seq: 'desc' },
    });
    expect(audit?.metadata).toMatchObject({ source: 'F50', create: 0, skip: 3 });
  });

  it('en un cliente existente solo completa lo vacío y suma contactos nuevos', async () => {
    const c = await ctx.prisma.client.findUniqueOrThrow({ where: { f50Folio: 'F-901' } });
    await ctx.prisma.client.update({
      where: { id: c.id },
      data: { address: 'Dirección cargada a mano', f50Folio: null },
    });
    await ctx.prisma.clientContact.deleteMany({ where: { clientId: c.id, name: 'Sol Ruiz' } });
    const res = await admin.upload(F50, 'f50.xlsx', '/api/clients/import?dryRun=false').expect(200);
    const row = res.body.rows.find((r: { folio: string }) => r.folio === 'F-901');
    expect(row).toMatchObject({ action: 'update', matchedBy: 'cuit', newContacts: 1 });
    const after = await ctx.prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.address).toBe('Dirección cargada a mano');
    expect(after.f50Folio).toBe('F-901');
  });
});
