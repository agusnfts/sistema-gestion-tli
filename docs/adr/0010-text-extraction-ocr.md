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

## Implementación (Fase 6)

- El texto de los PDF se lee con **pdfjs-dist** (JavaScript puro) en lugar de `pdftotext`: funciona igual en Windows (desarrollo) y en el servidor, sin binarios.
- El **OCR** de páginas escaneadas sigue siendo con `pdftoppm` + `tesseract -l spa`, y solo corre si están instalados. La imagen Docker del worker (Fase 8) los incluye. Sin OCR, la página se cuenta en `DocumentVersion.pagesWithoutText` y la UI muestra "N pág. escaneadas sin leer"; con "Volver a leer el texto" se reprocesa cuando el OCR esté disponible.
- DOCX con `mammoth`; texto y Markdown directo; imágenes PNG/JPG por OCR si hay. Excel y ZIP se omiten (`SKIPPED`).
- La extracción la dispara el antivirus al liberar el archivo (job `documents.extract`), o la subida si el archivo ya estaba liberado. Solo se indexa la versión vigente de cada documento.
- La carga masiva se hace desde la biblioteca (varios archivos a la vez, cada uno es un documento). `ImportJob` no se implementó: el progreso se ve en el estado de cada documento.
