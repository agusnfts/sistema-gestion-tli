# ADR 0006 — Almacenamiento de archivos y pipeline antivirus

- **Estado:** Aceptado (revisado en Fase 2b)
- **Fecha:** 2026-10-24

## Decisión

- Interfaz `StorageProvider` (`put`, `read`, `stream`, `move`, `delete`). Implementación actual:
  **carpeta local** (`STORAGE_LOCAL_DIR`), que en producción es un volumen de Docker fuera del
  webroot.
  - Cambio respecto del borrador: no se usa MinIO. Desde 2025 MinIO dejó de publicar imágenes de
    Docker para la edición comunitaria. El brief admite "S3 compatible o volumen local detrás de una
    interfaz"; si en el futuro se quiere S3, se agrega otra implementación de `StorageProvider`.
  - Solo se aceptan claves generadas por el sistema (`quarantine/<uuid>`, `clean/<uuid>`): no hay
    rutas arbitrarias ni path traversal.
- Flujo:
  1. Upload a `POST /api/attachments` (multipart, en memoria). Límite de 25 MB por archivo.
  2. Tipo validado por **magic bytes** y coincidencia con la extensión. Lista blanca: png, jpg, gif,
     webp, pdf, docx, xlsx, zip, txt, csv, xml, json, md, log.
  3. Se guarda en `quarantine/` con `scanStatus = PENDING_SCAN` y se encola `files.scan`.
  4. El worker envía el archivo a **clamd** (`INSTREAM` por TCP 3310). Limpio → se mueve a `clean/`
     y queda `CLEAN`. Infectado → se borra, queda `INFECTED`, se audita y se avisa al que lo subió y
     a Admin.
  5. El adjunto se vincula al ticket o comentario al crearlo (`attachmentIds`). Solo puede
     vincularlo quien lo subió, una sola vez. Los no vinculados se borran a las 24 h.
- Descarga: `GET /api/attachments/:id`. **La API chequea permisos y transmite el archivo** (cambio
  respecto del borrador, que usaba URLs firmadas de MinIO: con almacenamiento local no hace falta
  exponer otro servicio). Mismas reglas que el ticket: el solicitante ve los adjuntos públicos; los
  de notas internas solo IT. Si no puede verlo, 404.
  - Headers: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: … sandbox`,
    `Content-Disposition: attachment` (en línea solo imágenes y PDF con `?inline=1`).
  - Las descargas (no las miniaturas) quedan auditadas.

## Consecuencias

- Fail-closed: si ClamAV está caído, los archivos quedan "en análisis" y no se pueden abrir.
- Los backups (Fase 8) tienen que incluir el volumen de adjuntos además de la base.
