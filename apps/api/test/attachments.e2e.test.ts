import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  createUser,
  loginAs,
  type Client,
  type TestContext,
  type TestUser,
} from './helpers';
import { EMAIL_SENDER, type MemoryEmailSender } from '../src/notifications/email-sender';
import { FilesService } from '../src/files/files.service';

let ctx: TestContext;
let requester: TestUser;
let user: Client;
let it_: Client;
let other: Client;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const support = {
  type: 'SUPPORT',
  category: 'WMS',
  subject: 'No imprime etiquetas',
  description: 'Adjunto la captura del error.',
  userUrgency: 'MEDIUM',
  extra: {},
};

beforeAll(async () => {
  ctx = await createTestApp();
  requester = await createUser(ctx, 'user');
  user = await loginAs(ctx, requester);
  it_ = await loginAs(ctx, await createUser(ctx, 'it', { withMfa: true }));
  other = await loginAs(ctx, await createUser(ctx, 'user'));
});

afterAll(async () => {
  await ctx?.app.close();
});

describe('adjuntos', () => {
  it('sube una captura, el antivirus la libera y queda en el ticket', async () => {
    const up = await user.upload(PNG, 'captura.png').expect(201);
    expect(up.body).toMatchObject({
      name: 'captura.png',
      mimeType: 'image/png',
      scanStatus: 'CLEAN',
    });

    const created = await user
      .post('/api/tickets', { ...support, attachmentIds: [up.body.id] })
      .expect(201);
    const detail = await it_.get(`/api/tickets/${created.body.id}`).expect(200);
    expect(detail.body.attachments.map((a: { id: string }) => a.id)).toEqual([up.body.id]);

    const file = await it_.get(`/api/attachments/${up.body.id}`).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['content-disposition']).toMatch(/^attachment;/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    const inline = await user.get(`/api/attachments/${up.body.id}?inline=1`).expect(200);
    expect(inline.headers['content-disposition']).toMatch(/^inline;/);
  });

  it('otro usuario no puede ver el adjunto (404)', async () => {
    const up = await user.upload(PNG, 'privado.png').expect(201);
    await user.post('/api/tickets', { ...support, attachmentIds: [up.body.id] }).expect(201);
    await other.get(`/api/attachments/${up.body.id}`).expect(404);
  });

  it('un adjunto no se puede usar dos veces ni lo puede vincular otra persona', async () => {
    const up = await user.upload(PNG, 'una-vez.png').expect(201);
    await other.post('/api/tickets', { ...support, attachmentIds: [up.body.id] }).expect(400);
    await user.post('/api/tickets', { ...support, attachmentIds: [up.body.id] }).expect(201);
    await user.post('/api/tickets', { ...support, attachmentIds: [up.body.id] }).expect(400);
  });

  it('rechaza tipos no permitidos y archivos disfrazados', async () => {
    const exe = await user.upload(Buffer.from('MZ\x90\x00'), 'programa.exe').expect(400);
    expect(exe.body.message).toMatch(/Tipo de archivo no permitido/);
    await user.upload(Buffer.from('MZ\x90\x00'), 'foto.png').expect(400);
  });

  it('rechaza archivos de más de 25 MB', async () => {
    await user.upload(Buffer.alloc(25 * 1024 * 1024 + 1, 'a'), 'grande.txt').expect(413);
  });

  it('el antivirus descarta un archivo infectado, avisa y no deja usarlo', async () => {
    const up = await user.upload(Buffer.from(EICAR), 'virus.txt').expect(201);
    expect(up.body.scanStatus).toBe('INFECTED');
    await user.get(`/api/attachments/${up.body.id}`).expect(410);
    await user.post('/api/tickets', { ...support, attachmentIds: [up.body.id] }).expect(400);
    const notes = await ctx.prisma.notification.findMany({
      where: { userId: requester.id, kind: 'FILE_INFECTED' },
    });
    expect(notes.length).toBeGreaterThan(0);
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'file.infected', entityId: up.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it('el adjunto de una nota interna no lo ve el usuario', async () => {
    const { body: t } = await user.post('/api/tickets', support).expect(201);
    const up = await it_.upload(PNG, 'interno.png').expect(201);
    await it_
      .post(`/api/tickets/${t.id}/comments`, {
        body: 'Log del servidor',
        visibility: 'INTERNAL',
        attachmentIds: [up.body.id],
      })
      .expect(201);
    await user.get(`/api/attachments/${up.body.id}`).expect(404);
    await it_.get(`/api/attachments/${up.body.id}`).expect(200);
    const asIt = await it_.get(`/api/tickets/${t.id}`).expect(200);
    expect(asIt.body.comments[0].attachments[0].id).toBe(up.body.id);
  });

  it('borra los adjuntos que nunca se vincularon después de 24 h', async () => {
    const up = await user.upload(PNG, 'huerfano.png').expect(201);
    const removed = await ctx.app
      .get(FilesService)
      .cleanupOrphans(new Date(Date.now() + 25 * 3600_000));
    expect(removed).toBeGreaterThan(0);
    expect(await ctx.prisma.attachment.findUnique({ where: { id: up.body.id } })).toBeNull();
  });
});

describe('mail saliente', () => {
  let admin: Client;
  beforeAll(async () => {
    admin = await loginAs(ctx, await createUser(ctx, 'admin', { withMfa: true }));
  });

  it('está apagado por defecto: las notificaciones no generan mails', async () => {
    const outbox = (ctx.app.get(EMAIL_SENDER) as MemoryEmailSender).outbox;
    outbox.length = 0;
    const status = await admin.get('/api/settings/email').expect(200);
    expect(status.body.enabled).toBe(false);
    await user.post('/api/tickets', support).expect(201);
    expect(outbox).toHaveLength(0);
  });

  it('al habilitarlo, cada aviso sale también por mail con el link al ticket', async () => {
    const outbox = (ctx.app.get(EMAIL_SENDER) as MemoryEmailSender).outbox;
    await admin.put('/api/settings/email', { enabled: true }).expect(200);
    try {
      outbox.length = 0;
      const { body: t } = await user.post('/api/tickets', support).expect(201);
      const toIt = outbox.find((m) => m.subject.includes(t.number));
      expect(toIt?.text).toContain(`/tickets/${t.id}`);
      await admin.post('/api/settings/email/test').expect(200);
      expect(outbox.some((m) => m.subject === '[TLI] Mail de prueba')).toBe(true);
    } finally {
      await admin.put('/api/settings/email', { enabled: false }).expect(200);
    }
  });
});
