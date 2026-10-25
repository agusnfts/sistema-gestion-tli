import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

/** Almacenamiento de archivos detrás de una interfaz (ADR 0006). */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  stream(key: string): Readable;
  move(from: string, to: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const STORAGE = Symbol('STORAGE');

const KEY_PATTERN = /^(quarantine|clean)\/[0-9a-f-]{36}$/;

/** Carpeta local (en producción, un volumen de Docker fuera del webroot). */
export class LocalStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  /** Solo claves generadas por el sistema: impide rutas arbitrarias (path traversal). */
  private path(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error(`Clave de almacenamiento inválida: ${key}`);
    const full = resolve(this.root, key);
    if (!full.startsWith(resolve(this.root) + sep))
      throw new Error('Ruta fuera del almacenamiento');
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data, { flag: 'wx' });
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  stream(key: string): Readable {
    return createReadStream(this.path(key));
  }

  async move(from: string, to: string): Promise<void> {
    const dest = this.path(to);
    await mkdir(dirname(dest), { recursive: true });
    await rename(this.path(from), dest);
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  static keyFor(area: 'quarantine' | 'clean', id: string): string {
    return join(area, id).split(sep).join('/');
  }
}
