import { createHash } from 'node:crypto';

// Fragmentación (ADR 0011): ~800 tokens con ~100 de solapamiento, respetando párrafos y
// páginas. Se estima 1 token ≈ 4 caracteres (suficiente para dimensionar; no hay modelo).

export const CHUNK_CHARS = 3200;
export const OVERLAP_CHARS = 400;

export type PageText = { page: number | null; text: string };
export type Chunk = {
  pageNumber: number | null;
  ordinal: number;
  text: string;
  contentHash: string;
  tokenCount: number;
};

const normalize = (s: string) =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Corta un párrafo demasiado largo en pedazos por oraciones (o a la fuerza). */
function splitLong(paragraph: string): string[] {
  if (paragraph.length <= CHUNK_CHARS) return [paragraph];
  const sentences = paragraph.match(/[^.!?\n]+[.!?]*\s*/g) ?? [paragraph];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (s.length > CHUNK_CHARS) {
      if (cur) out.push(cur);
      for (let i = 0; i < s.length; i += CHUNK_CHARS) out.push(s.slice(i, i + CHUNK_CHARS));
      cur = '';
    } else if ((cur + s).length > CHUNK_CHARS) {
      out.push(cur);
      cur = s;
    } else cur += s;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Un fragmento nunca cruza páginas, para poder citar la página exacta. */
export function chunkPages(pages: PageText[]): Chunk[] {
  const chunks: Chunk[] = [];
  const push = (page: number | null, text: string) =>
    chunks.push({
      pageNumber: page,
      ordinal: chunks.length,
      text,
      contentHash: createHash('sha256').update(text).digest('hex'),
      tokenCount: Math.ceil(text.length / 4),
    });

  for (const { page, text } of pages) {
    const paragraphs = normalize(text)
      .split(/\n\s*\n/)
      .flatMap(splitLong)
      .filter((p) => p.trim().length > 0);
    let cur = '';
    // true si `cur` tiene algo más que el solapamiento heredado del fragmento anterior.
    let fresh = false;
    for (const p of paragraphs) {
      if (fresh && (cur + '\n\n' + p).length > CHUNK_CHARS) {
        const t = cur.trim();
        push(page, t);
        // Solapamiento: el final del fragmento anterior abre el siguiente.
        cur = t.length > OVERLAP_CHARS ? t.slice(-OVERLAP_CHARS).replace(/^\S*\s/, '') : '';
        fresh = false;
      }
      cur = cur ? `${cur}\n\n${p}` : p;
      fresh = true;
    }
    if (fresh && cur.trim()) push(page, cur.trim());
  }
  return chunks;
}
