# ADR 0012 — Infraestructura y dimensionamiento

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Contexto

~20 usuarios del sistema (de 60 empleados). VPS con Docker Compose: caddy, web, api, worker, postgres, redis, minio, clamav.

## Estimación de memoria

| Servicio                     | RAM aprox.                   |
| ---------------------------- | ---------------------------- |
| ClamAV (firmas cargadas)     | 1,2–1,5 GB                   |
| PostgreSQL 16                | 1 GB (shared_buffers 512 MB) |
| api (Node)                   | 300 MB                       |
| worker (Node + picos de OCR) | 300 MB – 1 GB                |
| MinIO                        | 300 MB                       |
| Redis                        | 100 MB                       |
| Caddy + web                  | 100 MB                       |
| SO + caché de disco          | 1,5–2 GB                     |
| **Total**                    | **~5–6,5 GB**                |

## Decisión

- **4 vCPU / 8 GB RAM**: validado. Holgura para picos de OCR en la carga masiva inicial. 4 GB no alcanza con ClamAV.
- **Disco 100 GB SSD**: a confirmar según volumen de PDF a importar. Estimación: SO + imágenes ~15 GB, base < 5 GB, documentos + adjuntos el resto. Backups **fuera** del VPS (storage S3 externo).
- Límites de memoria por contenedor en el Compose para que un pico de OCR no tire la base.
- Reverse proxy: **Caddy** (TLS automático con configuración mínima).
- Ubicación del VPS: a definir en Fase 8; se documentará el impacto de transferencias internacionales (RGPD / Ley 25.326).
