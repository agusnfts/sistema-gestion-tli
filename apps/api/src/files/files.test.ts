import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { detectFileType } from './file-type';
import { ClamdScanner, parseClamdReply } from './antivirus';
import { LocalStorage } from './storage';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.7\n...');
const EXE = Buffer.from('MZ\x90\x00\x03\x00');

describe('detectFileType', () => {
  it('reconoce tipos por sus primeros bytes', () => {
    expect(detectFileType(PNG, 'captura.png')).toEqual({ mime: 'image/png', ext: 'png' });
    expect(detectFileType(PDF, 'manual.PDF')).toEqual({ mime: 'application/pdf', ext: 'pdf' });
    expect(detectFileType(Buffer.from('codigo;cliente\n1;ACME'), 'datos.csv')?.mime).toBe(
      'text/csv',
    );
  });

  it('rechaza ejecutables y extensiones no permitidas', () => {
    expect(detectFileType(EXE, 'programa.exe')).toBeNull();
    expect(detectFileType(PNG, 'script.js')).toBeNull();
  });

  it('rechaza un archivo cuyo contenido no coincide con la extensión', () => {
    expect(detectFileType(EXE, 'foto.png')).toBeNull();
    expect(detectFileType(PDF, 'foto.png')).toBeNull();
    expect(detectFileType(Buffer.from([0x00, 0x01, 0x02]), 'notas.txt')).toBeNull();
  });
});

describe('ClamAV', () => {
  it('interpreta las respuestas de clamd', () => {
    expect(parseClamdReply('stream: OK\0')).toEqual({ clean: true });
    expect(parseClamdReply('stream: Win.Test.EICAR_HDB-1 FOUND\0')).toEqual({
      clean: false,
      signature: 'Win.Test.EICAR_HDB-1',
    });
    expect(() => parseClamdReply('INSTREAM size limit exceeded. ERROR')).toThrow();
  });

  describe('protocolo INSTREAM contra un clamd simulado', () => {
    let server: Server;
    let port = 0;
    let received = Buffer.alloc(0);

    beforeAll(async () => {
      server = createServer((socket) => {
        let buf = Buffer.alloc(0);
        socket.on('data', (d) => {
          buf = Buffer.concat([buf, d]);
          // Fin del stream: un bloque de largo 0 al final.
          if (buf.length >= 14 && buf.subarray(-4).equals(Buffer.alloc(4))) {
            const payload: Buffer[] = [];
            let i = 'zINSTREAM\0'.length;
            for (;;) {
              const size = buf.readUInt32BE(i);
              i += 4;
              if (size === 0) break;
              payload.push(buf.subarray(i, i + size));
              i += size;
            }
            received = Buffer.concat(payload);
            socket.end(received.includes('VIRUS') ? 'stream: Fake.Virus FOUND\0' : 'stream: OK\0');
          }
        });
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      port = (server.address() as { port: number }).port;
    });

    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it('envía el archivo completo en bloques y lee el resultado', async () => {
      const scanner = new ClamdScanner('127.0.0.1', port);
      const big = Buffer.alloc(200_000, 'a');
      expect(await scanner.scan(big)).toEqual({ clean: true });
      expect(received.equals(big)).toBe(true);
      expect(await scanner.scan(Buffer.from('hay un VIRUS acá'))).toEqual({
        clean: false,
        signature: 'Fake.Virus',
      });
    });

    it('falla si clamd no está disponible', async () => {
      await expect(new ClamdScanner('127.0.0.1', 1).scan(Buffer.from('x'))).rejects.toThrow();
    });
  });
});

describe('LocalStorage', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tli-storage-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('guarda, mueve y borra', async () => {
    const storage = new LocalStorage(dir);
    const id = randomUUID();
    await storage.put(LocalStorage.keyFor('quarantine', id), Buffer.from('hola'));
    await storage.move(LocalStorage.keyFor('quarantine', id), LocalStorage.keyFor('clean', id));
    expect((await storage.read(LocalStorage.keyFor('clean', id))).toString()).toBe('hola');
    await storage.delete(LocalStorage.keyFor('clean', id));
    await expect(storage.read(LocalStorage.keyFor('clean', id))).rejects.toThrow();
  });

  it('solo acepta claves generadas por el sistema (sin path traversal)', async () => {
    const storage = new LocalStorage(dir);
    await expect(storage.read('../../etc/passwd')).rejects.toThrow();
    await expect(storage.put('clean/../../x', Buffer.from('x'))).rejects.toThrow();
  });
});
