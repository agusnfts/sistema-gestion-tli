# ADR 0010 — Extracción de texto y OCR de documentos

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Decisión

Herramientas de sistema en la imagen del worker (Debian slim): `poppler-utils`, `tesseract-ocr`, `tesseract-ocr-spa`.

- **PDF:** `pdftotext -layout -f N -l N` página por página. Si una página tiene menos de ~20 caracteres útiles, se considera escaneada: `pdftoppm -r 300` → `tesseract -l spa`. Si al menos una página usó OCR, `DocumentVersion.ocrUsed = true` y la UI muestra "Texto extraído por OCR".
- **DOCX:** `mammoth` → texto (sin página; se fragmenta por secciones).
- **Markdown:** texto directo, fragmentado por títulos.
- Ejecución con `execFile` (sin shell), timeouts y límite de páginas por documento; archivos temporales en un directorio efímero por job.
- Concurrencia del job de OCR: 1 (configurable) para no saturar la CPU del VPS durante la carga masiva inicial.
- Errores → `extractionStatus = FAILED` con detalle visible para IT y reintento manual.

## Consecuencias

- La carga masiva inicial puede tardar horas según el volumen de PDF escaneados; corre en segundo plano con progreso visible en `ImportJob`.
