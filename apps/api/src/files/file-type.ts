import { ALLOWED_ATTACHMENT_EXTENSIONS } from '@tli/shared';

type Detected = { mime: string; ext: string };

const TEXT_TYPES: Record<string, string> = {
  txt: 'text/plain',
  log: 'text/plain',
  csv: 'text/csv',
  xml: 'application/xml',
  json: 'application/json',
  md: 'text/markdown',
};

const ZIP_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((b, i) => buf[offset + i] === b);
}

function isUtf8Text(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, 64 * 1024));
    return true;
  } catch {
    // Puede cortar un carácter multibyte al final del fragmento: se revisa el archivo completo.
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Detecta el tipo real por los primeros bytes (no por lo que diga el navegador) y exige
 * que coincida con la extensión. Devuelve null si el tipo no está permitido.
 */
export function detectFileType(buf: Buffer, originalName: string): Detected | null {
  const ext = originalName.toLowerCase().split('.').pop() ?? '';
  if (!(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) return null;

  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return ext === 'png' ? { mime: 'image/png', ext } : null;
  }
  if (startsWith(buf, [0xff, 0xd8, 0xff])) {
    return ext === 'jpg' || ext === 'jpeg' ? { mime: 'image/jpeg', ext } : null;
  }
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38]))
    return ext === 'gif' ? { mime: 'image/gif', ext } : null;
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return ext === 'webp' ? { mime: 'image/webp', ext } : null;
  }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return ext === 'pdf' ? { mime: 'application/pdf', ext } : null;
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]))
    return ZIP_TYPES[ext] ? { mime: ZIP_TYPES[ext]!, ext } : null;
  if (TEXT_TYPES[ext] && isUtf8Text(buf)) return { mime: TEXT_TYPES[ext]!, ext };
  return null;
}

/** Tipos que el navegador puede mostrar en línea sin riesgo (con CSP sandbox). */
export function isInlineSafe(mime: string): boolean {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'].includes(mime);
}
