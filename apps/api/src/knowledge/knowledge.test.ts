import { describe, expect, it } from 'vitest';
import { htmlToPlainText, isHtml, sanitizeRichText } from '../common/rich-text';
import { CHUNK_CHARS, chunkPages } from './chunking';
import { extractText } from './extract';

/** PDF mínimo con una línea de texto por página (para probar la extracción sin archivos). */
function tinyPdf(pages: string[]): Buffer {
  const objs: string[] = [];
  // Los objetos se numeran 1, 2, 3… en el orden en que se agregan.
  const add = (body: string) => void objs.push(body);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((text, i) => {
    const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

describe('sanitizeRichText', () => {
  it('saca scripts, estilos, eventos y links peligrosos', () => {
    const out = sanitizeRichText(
      '<p style="color:red" onclick="x()">Hola <script>alert(1)</script><a href="javascript:alert(1)">link</a> <a href="https://tml.com.ar">tml</a></p><iframe src="x"></iframe>',
    );
    expect(out).not.toMatch(/script|style|onclick|javascript|iframe/);
    expect(out).toContain(
      '<a href="https://tml.com.ar" rel="noopener noreferrer" target="_blank">tml</a>',
    );
  });

  it('solo deja imágenes de adjuntos propios', () => {
    const id = '0f0e0d0c-0b0a-4908-8706-050403020100';
    expect(
      sanitizeRichText(`<p><img src="/api/attachments/${id}?inline=1" alt="x"></p>`),
    ).toContain('<img');
    expect(sanitizeRichText('<p><img src="https://evil.example/x.png"></p>')).not.toContain('<img');
  });
});

describe('htmlToPlainText', () => {
  it('convierte bloques en renglones y deja pasar el texto plano', () => {
    expect(htmlToPlainText('<h3>Flujo</h3><p>Uno &amp; dos</p><ul><li>a</li><li>b</li></ul>')).toBe(
      'Flujo\nUno & dos\n• a\n• b',
    );
    expect(isHtml('texto viejo <b>')).toBe(false);
    expect(htmlToPlainText('texto viejo')).toBe('texto viejo');
  });
});

describe('chunkPages', () => {
  it('no cruza páginas y conserva el número de página', () => {
    const chunks = chunkPages([
      { page: 1, text: 'Primera página.' },
      { page: 2, text: 'Segunda página.' },
    ]);
    expect(chunks.map((c) => [c.pageNumber, c.text])).toEqual([
      [1, 'Primera página.'],
      [2, 'Segunda página.'],
    ]);
  });

  it('corta textos largos con solapamiento y sin pasarse del tamaño', () => {
    const paragraph = 'El pedido se carga en el WMS y se libera para preparar. '.repeat(30);
    const text = Array.from({ length: 6 }, () => paragraph).join('\n\n');
    const chunks = chunkPages([{ page: null, text }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(CHUNK_CHARS + 400);
    // El final de un fragmento reaparece al principio del siguiente.
    const tail = chunks[0]!.text.slice(-100);
    expect(chunks[1]!.text).toContain(tail.slice(-60));
  });
});

describe('extractText', () => {
  it('lee el texto de cada página de un PDF', async () => {
    const r = await extractText(
      tinyPdf([
        'Manual del WMS: carga de pedidos manual por Excel',
        'Pagina dos: etiquetas de despacho del TMS',
      ]),
      'application/pdf',
    );
    expect(r.pageCount).toBe(2);
    expect(r.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(r.pages[1]!.text).toContain('etiquetas de despacho');
    expect(r.ocrUsed).toBe(false);
  });

  it('una página sin texto cuenta como escaneada', async () => {
    const r = await extractText(
      tinyPdf(['', 'Texto suficiente en la segunda pagina del documento']),
      'application/pdf',
    );
    expect(r.pages.map((p) => p.page)).not.toContain(1);
    // Sin Tesseract instalado queda como "sin texto"; con Tesseract, igual no hay nada que leer.
    expect(r.pagesWithoutText).toBe(1);
  });

  it('Excel y ZIP se omiten', async () => {
    const r = await extractText(Buffer.from('x'), 'application/zip');
    expect(r.skipped).toBe(true);
  });
});
