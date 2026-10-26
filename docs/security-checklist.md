# Checklist de seguridad (OWASP ASVS 4.0.3 nivel 2, ISO 27001)

Estado al cierre de la Fase 8. ✅ cumplido · 🟡 parcial o depende de la operación · ⏳ pendiente de decisión.
Revisar antes de salir a producción y una vez por año.

| Capítulo ASVS        | Requisito                                                       | Estado | Cómo / dónde                                                                                                                         |
| -------------------- | --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| V1 Arquitectura      | Modelo de amenazas y componentes documentados                   | ✅     | `docs/architecture.md`, ADRs                                                                                                         |
| V1                   | Mínimo privilegio en la base                                    | ✅     | Rol `tli_app` solo DML; migraciones con el owner (`deploy/postgres/init`)                                                            |
| V2 Autenticación     | Contraseñas ≥ 12, chequeo de comunes, sin reglas de composición | ✅     | `packages/shared/src/password-policy.ts`                                                                                             |
| V2                   | Almacenamiento con argon2id                                     | ✅     | `packages/db/src/password.ts` (m=19 MiB, t=3)                                                                                        |
| V2                   | MFA para roles con privilegios                                  | ✅     | TOTP obligatorio para Admin/IT; códigos de recuperación de un uso                                                                    |
| V2                   | Bloqueo y rate limiting                                         | ✅     | Bloqueo incremental tras 5 fallos; 10 intentos/min por IP                                                                            |
| V2                   | Recuperación segura                                             | ✅     | Sin preguntas secretas; reset por Admin o `recover-access` en el servidor, auditados                                                 |
| V3 Sesiones          | Sesión del lado del servidor, token hasheado                    | ✅     | [ADR 0003](adr/0003-server-side-sessions.md)                                                                                         |
| V3                   | Cookie `__Host-`, `Secure`, `HttpOnly`, `SameSite`              | ✅     | `COOKIE_SECURE=true` en producción                                                                                                   |
| V3                   | Expiración por inactividad y absoluta; rotación al loguear      | ✅     | 30 min / 12 h para roles con MFA                                                                                                     |
| V3                   | Revocación al cambiar contraseña, roles o deshabilitar          | ✅     | `SessionService.revokeAllForUser`                                                                                                    |
| V4 Control de acceso | Deny by default, permisos granulares en el servidor             | ✅     | `AccessGuard`: endpoint sin política → 403                                                                                           |
| V4                   | Control por recurso (IDOR)                                      | ✅     | Tickets por solicitante; adjuntos y documentos según entidad; tests e2e                                                              |
| V4                   | CSRF                                                            | ✅     | Double-submit + `Origin` ([ADR 0004](adr/0004-same-origin-csrf.md))                                                                  |
| V5 Validación        | Validación de entrada con esquemas en el servidor               | ✅     | zod compartido (`@tli/shared`) en todos los endpoints                                                                                |
| V5                   | Sanitización de HTML                                            | ✅     | `sanitize-html` con lista blanca ([ADR 0009](adr/0009-rich-text.md))                                                                 |
| V5                   | Consultas parametrizadas                                        | ✅     | Prisma; SQL crudo con plantillas parametrizadas                                                                                      |
| V7 Errores y logs    | Logs sin datos sensibles                                        | ✅     | pino con redacción de cookies/tokens; JSON con rotación                                                                              |
| V7                   | Auditoría inalterable                                           | ✅     | Cadena de hashes + trigger ([ADR 0008](adr/0008-immutable-audit-log.md)); verificación en Administración y en el simulacro de backup |
| V8 Datos             | Datos personales mínimos, derechos de titulares                 | ✅     | Exportación y anonimización (`privacy.*`); registro de tratamiento                                                                   |
| V8                   | Secretos fuera del repo                                         | ✅     | `deploy/.env` (600, ignorado por git); `.dockerignore` excluye `.env`                                                                |
| V8                   | Cifrado de secretos TOTP en reposo                              | ✅     | AES-256-GCM con `MFA_ENCRYPTION_KEY`                                                                                                 |
| V8                   | Backups cifrados y probados                                     | ✅     | age (clave pública) + simulacro de restauración (`deploy/restore-drill.sh`)                                                          |
| V9 Comunicaciones    | TLS en todo, HSTS                                               | ✅     | Caddy (Let's Encrypt) + HSTS 1 año                                                                                                   |
| V10 Código malicioso | Dependencias sin vulnerabilidades conocidas                     | ✅     | `pnpm audit` en CI; versiones fijadas                                                                                                |
| V12 Archivos         | Tipo por contenido, tamaño máximo, antivirus                    | ✅     | Magic bytes, 25 MB, ClamAV con cuarentena ([ADR 0006](adr/0006-file-storage-antivirus.md))                                           |
| V12                  | Archivos fuera del webroot, servidos con permisos               | ✅     | Volumen `storage`; `Content-Disposition` y CSP `sandbox`                                                                             |
| V13 API              | Solo JSON, límites de tamaño                                    | ✅     | Body 27 MB en Caddy; 5 MB para el F50                                                                                                |
| V14 Configuración    | Encabezados de seguridad                                        | ✅     | CSP sin scripts inline, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy`                                                       |
| V14                  | Contenedores endurecidos                                        | ✅     | Sin root, `no-new-privileges`, `cap_drop: ALL`, FS de solo lectura (api/worker)                                                      |
| V14                  | Imágenes fijadas                                                | 🟡     | Por tag; fijar por digest en el servidor (`docs/deploy.md`)                                                                          |
| Operación            | Monitoreo y alertas                                             | 🟡     | Healthcheck + monitor externo a configurar                                                                                           |
| Operación            | Hardening del VPS                                               | 🟡     | Procedimiento en `docs/deploy.md`; se aplica al crear el servidor                                                                    |
| Operación            | Ubicación del VPS y backups (transferencias)                    | ⏳     | Decisión pendiente (`docs/data-processing-register.md`)                                                                              |
| Operación            | Inscripción de la base ante la AAIP                             | ⏳     | Decisión del área                                                                                                                    |

## ISO 27001 (controles del Anexo A cubiertos por el sistema)

- **A.5.15–5.18 Control de acceso:** RBAC, altas solo por Admin, revisión de usuarios desde Administración.
- **A.8.5 Autenticación segura:** MFA, bloqueo, argon2id.
- **A.8.13 Copias de respaldo:** backups cifrados diarios, fuera del VPS, simulacro mensual.
- **A.8.15–8.16 Registro y monitoreo:** auditoría inalterable, logs estructurados, healthchecks.
- **A.8.24 Criptografía:** TLS, AES-256-GCM para MFA, age para backups.
- **A.5.24–5.28 Incidentes:** [runbook](runbook.md).
