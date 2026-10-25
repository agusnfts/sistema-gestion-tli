import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PageText } from './chunking';

// Extracción de texto (ADR 0010, ajustado): el texto de los PDF se lee con pdfjs-dist (JS
// puro, igual en Windows y en el servidor). Las páginas escaneadas se pasan por OCR con
// Tesseract solo si está instalado (la imagen Docker del worker lo trae); si no, se cuentan
// como "sin texto" y la UI lo avisa.

const run = promisify(execFile);
const MAX_PAGES = 500;
const OCR_TIMEOUT_MS = 120_000;
/** Menos caracteres útiles que esto: la página se considera escaneada. */
const MIN_PAGE_CHARS = 20;

export type Extraction = {
  pages: PageText[];
  pageCount: number | null;
  ocrUsed: boolean;
  pagesWithoutText: number;
  /** Sin texto extraíble por el formato (Excel, ZIP…). */
  skipped: boolean;
};

let ocrAvailable: Promise<boolean> | null = null;

/** ¿Hay Tesseract y pdftoppm? Se averigua una vez por proceso. */
export function hasOcr(): Promise<boolean> {
  ocrAvailable ??= Promise.all([
    run('tesseract', ['--version'], { timeout: 5000 }),
    run('pdftoppm', ['-v'], { timeout: 5000 }),
  ])
    .then(() => true)
    .catch(() => false);
  return ocrAvailable;
}

async function ocrImage(path: string): Promise<string> {
  const { stdout } = await run('tesseract', [path, 'stdout', '-l', 'spa'], {
    timeout: OCR_TIMEOUT_MS,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function ocrPdfPage(pdfPath: string, page: number, dir: string): Promise<string> {
  const prefix = join(dir, `p${page}`);
  await run(
    'pdftoppm',
    ['-r', '300', '-f', String(page), '-l', String(page), '-png', '-singlefile', pdfPath, prefix],
    { timeout: OCR_TIMEOUT_MS },
  );
  return ocrImage(`${prefix}.png`);
}

async function extractPdf(buffer: Buffer): Promise<Extraction> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const pageCount = doc.numPages;
  const pages: PageText[] = [];
  const scanned: number[] = [];
  try {
    for (let n = 1; n <= Math.min(pageCount, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .replace(/[ \t]+/g, ' ');
      if (text.replace(/\s/g, '').length < MIN_PAGE_CHARS) scanned.push(n);
      else pages.push({ page: n, text });
      page.cleanup();
    }
  } finally {
    await doc.loadingTask.destroy();
  }

  let ocrUsed = false;
  let pagesWithoutText = scanned.length;
  if (scanned.length && (await hasOcr())) {
    const dir = await mkdtemp(join(tmpdir(), 'tli-ocr-'));
    try {
      const pdfPath = join(dir, 'doc.pdf');
      await writeFile(pdfPath, buffer);
      // De a una página: el OCR es pesado y el VPS es chico (ADR 0010).
      for (const n of scanned) {
        const text = await ocrPdfPage(pdfPath, n, dir).catch(() => '');
        if (text.replace(/\s/g, '').length >= MIN_PAGE_CHARS) {
          pages.push({ page: n, text });
          ocrUsed = true;
          pagesWithoutText--;
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    pages.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
  }
  return { pages, pageCount, ocrUsed, pagesWithoutText, skipped: false };
}

async function extractImage(buffer: Buffer, ext: string): Promise<Extraction> {
  if (!(await hasOcr())) {
    return { pages: [], pageCount: 1, ocrUsed: false, pagesWithoutText: 1, skipped: false };
  }
  const dir = await mkdtemp(join(tmpdir(), 'tli-ocr-'));
  try {
    const path = join(dir, `img.${ext}`);
    await writeFile(path, buffer);
    const text = await ocrImage(path).catch(() => '');
    const ok = text.replace(/\s/g, '').length >= MIN_PAGE_CHARS;
    return {
      pages: ok ? [{ page: 1, text }] : [],
      pageCount: 1,
      ocrUsed: ok,
      pagesWithoutText: ok ? 0 : 1,
      skipped: false,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function extractText(buffer: Buffer, mime: string): Promise<Extraction> {
  if (mime === 'application/pdf') return extractPdf(buffer);
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer });
    return {
      pages: [{ page: null, text: value }],
      pageCount: null,
      ocrUsed: false,
      pagesWithoutText: 0,
      skipped: false,
    };
  }
  if (mime.startsWith('text/')) {
    return {
      pages: [{ page: null, text: buffer.toString('utf8') }],
      pageCount: null,
      ocrUsed: false,
      pagesWithoutText: 0,
      skipped: false,
    };
  }
  if (mime === 'image/png') return extractImage(buffer, 'png');
  if (mime === 'image/jpeg') return extractImage(buffer, 'jpg');
  return { pages: [], pageCount: null, ocrUsed: false, pagesWithoutText: 0, skipped: true };
}
