import { connect } from 'node:net';

export type ScanResult = { clean: true } | { clean: false; signature: string };

export interface AntivirusScanner {
  scan(data: Buffer): Promise<ScanResult>;
}

export const ANTIVIRUS = Symbol('ANTIVIRUS');

const CHUNK = 64 * 1024;

/**
 * Cliente de clamd por TCP con el comando INSTREAM:
 * se envían bloques precedidos por su largo (4 bytes big-endian) y un bloque vacío al final.
 * Respuesta: "stream: OK" o "stream: <firma> FOUND".
 */
export class ClamdScanner implements AntivirusScanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 60_000,
  ) {}

  scan(data: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      socket.setTimeout(this.timeoutMs, () =>
        socket.destroy(new Error('clamd no respondió a tiempo')),
      );
      socket.on('error', reject);
      socket.on('data', (d) => chunks.push(d));
      socket.on('end', () => {
        try {
          resolve(parseClamdReply(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(e);
        }
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let i = 0; i < data.length; i += CHUNK) {
          const part = data.subarray(i, i + CHUNK);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(part.length);
          socket.write(size);
          socket.write(part);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}

export function parseClamdReply(raw: string): ScanResult {
  const reply = raw.replace(/\0/g, '').trim();
  if (/:\s*OK$/.test(reply)) return { clean: true };
  const found = /:\s*(.+)\s+FOUND$/.exec(reply);
  if (found) return { clean: false, signature: found[1]! };
  throw new Error(`Respuesta inesperada de clamd: ${reply}`);
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/** Solo para tests (CLAMAV_DRIVER=eicar): detecta el archivo de prueba estándar EICAR. */
export class EicarScanner implements AntivirusScanner {
  async scan(data: Buffer): Promise<ScanResult> {
    return data.includes(EICAR)
      ? { clean: false, signature: 'Eicar-Test-Signature' }
      : { clean: true };
  }
}
