import sanitizeHtml from 'sanitize-html';
import { isHtml } from '@tli/shared';

// Texto enriquecido (ADR 0009): el HTML se sanitiza SIEMPRE en el servidor al guardar, con
// lista blanca. Sin estilos inline, sin iframes, sin atributos on*. Las imágenes solo pueden
// apuntar a adjuntos internos.

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'h2',
    'h3',
    'h4',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'a',
    'code',
    'pre',
    'blockquote',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'img',
  ],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    img: ['src', 'alt'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: [] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: 'noopener noreferrer', target: '_blank' },
    }),
  },
  // Imágenes: solo adjuntos servidos por la propia API (rutas relativas).
  exclusiveFilter: (frame) =>
    frame.tag === 'img' &&
    !/^\/api\/attachments\/[0-9a-f-]{36}(\?inline=1)?$/.test(frame.attribs.src ?? ''),
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

export { isHtml };

/**
 * Texto plano para indexar, notificar o mandar por mail: sin etiquetas, con saltos de línea
 * donde había bloques. El texto plano viejo pasa tal cual.
 */
export function htmlToPlainText(text: string): string {
  if (!isHtml(text)) return text.trim();
  const withBreaks = text
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[2-4]|li|tr|blockquote|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
