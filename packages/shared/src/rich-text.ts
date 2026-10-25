/**
 * ¿El texto guardado es HTML del editor o texto plano (contenido anterior al editor)?
 * La API sanitiza todo lo que cumple esto antes de guardarlo; la web solo renderiza como HTML
 * lo que cumple esto. Así un texto plano nunca se interpreta como HTML.
 */
export function isHtml(text: string): boolean {
  return /^\s*<(p|h[2-4]|ul|ol|blockquote|pre|table|hr|img)[\s>/]/i.test(text);
}
