# ADR 0013 — Canales de entrada extensibles (mail y chatbot a futuro)

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Contexto

Hoy los tickets entran solo por formulario web y las notificaciones son in-app (mail saliente preparado y apagado). A futuro se quiere sumar **entrada por mail** y un **chatbot**, sin reescribir la ticketera.

## Decisión

1. **Servicios de aplicación independientes del canal.** `TicketService.create(command, actor)`, `TicketService.addComment(...)`, etc. reciben comandos validados con zod y un `actor` resuelto. El controller HTTP es un adaptador más; mail y chatbot serán otros adaptadores que llaman a los mismos servicios, con las mismas reglas de permisos, SLA y auditoría.
2. **Canal registrado en los datos:** `Ticket.channel` y `TicketComment.source` (`WEB` hoy; `EMAIL`, `CHATBOT`, `SYSTEM` previstos en el enum).
3. **Notificaciones multicanal:** `NotificationService` emite un evento de dominio y cada canal (`InAppChannel`, `EmailChannel`) decide si lo entrega según configuración y preferencias del usuario. Mail apagado por defecto (`EmailSender` SMTP genérico).
4. **Mail entrante (futuro):** adaptador que lee una casilla (IMAP o webhook del proveedor), identifica al solicitante por email **solo si es un usuario existente**, enhebra respuestas por token en el asunto (`[TLI-000123]`) y una tabla `InboundMessage(messageId, ticketId, ...)` para deduplicar. El cuerpo pasa por el mismo sanitizador y los adjuntos por el mismo pipeline antivirus.
5. **Chatbot (futuro):** actúa **en nombre del usuario logueado**, con sus permisos. Consulta la base de conocimiento vía la búsqueda de [ADR 0011](0011-ai-readiness-chunks.md) (respetando visibilidad) y, si no resuelve, ofrece crear el ticket llamando a `TicketService.create` con `channel = CHATBOT`, precargando tipo y descripción.

## Consecuencias

- No se implementa nada de mail entrante ni chatbot ahora; solo se respetan estas fronteras y los enums.
