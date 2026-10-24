# ADR 0007 — Motor de SLA en horario hábil

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Contexto

SLA de 1ª respuesta y resolución por tipo y prioridad, contado solo en horario hábil (L–V 8–17 h, `America/Argentina/Buenos_Aires`, sin feriados editables). El reloj se pausa en "Esperando usuario/proveedor" y se detiene en estados derivados. Alerta al quedar el 25 % del tiempo, marca de vencido al superarlo.

## Decisión

- Módulo puro en `packages/shared/sla`:
  - `addBusinessMinutes(start, minutes, calendar) → Date`
  - `businessMinutesBetween(a, b, calendar) → number`
  - `calendar` = horario semanal + feriados + zona horaria.
  - Fechas con `date-fns` + `date-fns-tz`. Sin I/O: 100 % testeable con casos borde (viernes 16:50, feriados largos, cambios de horario, tickets creados fuera de horario).
- El ticket guarda `firstResponseDueAt` y `resolutionDueAt`. Se recalculan:
  - al crear (con prioridad provisoria = urgencia del usuario);
  - al cambiar la prioridad;
  - al reanudar desde una pausa (se suman los minutos hábiles pausados).
- 1ª respuesta = primer comentario **público** de IT o primer cambio a "En curso", lo que ocurra primero.
- Propuestas de mejora y pedidos de integración: solo SLA de 1ª respuesta (2 días hábiles), sin SLA de resolución.
- Job repetible en el worker cada minuto: busca tickets activos cuyo consumo cruce el 75 % (→ `AT_RISK`, notifica al asignado y a Admin, una sola vez) o el 100 % (→ `BREACHED`). Idempotente.
- Cambios de configuración de SLA aplican a tickets nuevos; los existentes conservan sus vencimientos.

## Consecuencias

- Las listas y el dashboard filtran por fecha guardada (índices simples), sin calcular en cada consulta.
