# ADR 0008 — Log de auditoría inmutable

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Decisión

- Tabla `AuditLog` separada del historial funcional (`ActivityEvent`). Auditoría = seguridad y cumplimiento; actividad = lo que ve el usuario en el detalle.
- Eventos auditados: login OK/fallido, bloqueo, MFA (alta, reseteo, uso de código de recuperación), logout, revocación de sesiones, alta/baja/edición de usuarios, cambios de roles y permisos, cambios de configuración, cambios de estado de tickets/problemas/mejoras/integraciones, exportaciones y anonimizaciones, descargas de archivos, accesos a datos personales de otros usuarios.
- Inmutabilidad:
  - El rol de base de la app solo tiene `INSERT` y `SELECT` sobre `AuditLog` (`REVOKE UPDATE, DELETE, TRUNCATE`).
  - Cadena de hashes: `hash = sha256(prevHash || payload canónico)`. Un job diario verifica la cadena y alerta si se rompe.
  - Inserción serializada con advisory lock para mantener el orden de la cadena.
- `metadata` nunca guarda contraseñas, secretos, tokens ni contenido de tickets; solo IDs y campos cambiados.
- Logs de aplicación (pino) con redacción de `password`, `token`, `cookie`, `authorization`, `mfa*`.

## Consecuencias

- La anonimización de un titular no reescribe la auditoría: el `actorId` queda apuntando a un usuario anonimizado (sin nombre ni email).
