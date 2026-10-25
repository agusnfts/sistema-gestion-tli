# ADR 0014 — Worker: mismo código que la API, otro proceso

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Contexto

El diseño inicial (ADR 0001) preveía un paquete `apps/worker` separado. Los jobs en segundo plano
(antivirus de adjuntos, envío de mails, monitor de SLA, cierre automático y limpieza) usan la
misma lógica de dominio que la API: servicios de tickets, configuración, notificaciones, archivos,
Prisma y auditoría.

## Decisión

- El worker es **otro entrypoint del mismo código**: `apps/api/src/worker.main.ts`. Levanta el
  contexto de Nest (sin HTTP) y procesa la cola `tli` de **BullMQ** sobre Redis.
- Cada módulo registra sus handlers en un `JobRegistry` (`files.scan`, `email.send`,
  `maintenance.sla`, `maintenance.cleanup`). La API encola con `QueueService.add()`.
- Jobs periódicos con `upsertJobScheduler` de BullMQ: el monitor de SLA cada minuto y la limpieza de
  adjuntos huérfanos cada hora. BullMQ garantiza que corran una sola vez aunque haya varios workers.
- Reintentos con backoff exponencial (el antivirus hasta 10 veces: si ClamAV está caído, los
  adjuntos quedan "en análisis" y no se sirven, fail-closed).
- **Modo inline** (`QUEUE_INLINE=true`, solo tests): los jobs se ejecutan en el mismo proceso, sin
  Redis ni worker.
- En desarrollo, `pnpm dev` corre la API (`dev:api`) y el worker (`dev:worker`, compilado en
  `dist-worker`). En producción es la misma imagen con otro comando: `node dist/worker.main.js`.

## Consecuencias

- Sin duplicar lógica de dominio ni crear un paquete de "core" compartido solo para esto.
- La API y el worker se despliegan y versionan juntos.
- `apps/worker` no existe como paquete; la documentación que lo mencionaba refiere a este proceso.
