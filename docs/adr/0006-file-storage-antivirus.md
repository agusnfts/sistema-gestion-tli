# ADR 0006 — Almacenamiento de archivos y pipeline antivirus

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Decisión

- Interfaz `StorageProvider` (`put`, `get`, `move`, `delete`, `signedUrl`) con implementación S3 (MinIO en producción y desarrollo). Implementación de volumen local para tests.
- Buckets/prefijos: `quarantine/` y `clean/`. Nada se sirve desde `quarantine/`.
- Flujo:
  1. Upload a la API (multipart, streaming). Validación de tamaño (25 MB adjuntos, 100 MB documentos) y de tipo por **magic bytes**, no solo extensión. Lista blanca: imágenes (png, jpg, webp, gif), pdf, docx, xlsx, csv, txt, xml, json, md, zip.
  2. Se calcula sha256 y se guarda en `quarantine/` con nombre aleatorio. `Attachment.scanStatus = PENDING_SCAN`.
  3. Job `scan-file` en el worker: stream a clamd (TCP 3310). `CLEAN` → mover a `clean/`. `INFECTED` → borrar, marcar, notificar al que subió y a Admin, auditar.
- Descarga: endpoint `GET /api/files/:id` que chequea permisos sobre la entidad vinculada y responde con redirect a URL firmada de MinIO de 60 s, con `Content-Disposition: attachment` (salvo PDF/imagen en el visor).
- MinIO no se expone a internet: las URLs firmadas pasan por Caddy en una ruta `/files/*` hacia MinIO.

## Consecuencias

- El usuario ve "Analizando archivo…" por unos segundos tras subir.
- Si ClamAV está caído, los archivos quedan en `PENDING_SCAN` (fail-closed) y se alerta en el healthcheck.
