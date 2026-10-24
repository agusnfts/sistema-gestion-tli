# ADR 0003 — Sesiones del lado del servidor (no JWT)

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Contexto

Requisitos: cookies `httpOnly` + `Secure` + `SameSite`, expiración, **revocación** (al deshabilitar un usuario, cambiar contraseña o permisos) y MFA obligatorio para roles de gestión. OWASP ASVS L2 (capítulo 3).

## Decisión

- Tabla `Session` en PostgreSQL. La cookie `__Host-tli_sid` lleva un ID aleatorio de 256 bits; la base guarda solo su hash SHA-256.
- Expiración por inactividad: 30 min para roles con MFA, 8 h para Usuario. Expiración absoluta: 12 h / 7 días. Configurables.
- Regeneración de ID al loguear y al completar MFA.
- Flujo de login en dos pasos: contraseña → sesión con `mfaVerified=false` (solo puede verificar MFA) → TOTP → `mfaVerified=true`.
- Revocación: al deshabilitar usuario, cambiar contraseña, resetear MFA o cambiar roles, se revocan todas sus sesiones. El usuario ve y puede cerrar sus sesiones activas.
- Contraseñas con argon2id (parámetros OWASP: m=19 MiB, t=2, p=1 como mínimo). Política: mínimo 12 caracteres, chequeo contra lista de contraseñas comunes, sin reglas de composición forzadas (NIST 800-63B).
- Bloqueo: 5 intentos fallidos → bloqueo de 15 min, incremental. Rate limit por IP y por cuenta.
- TOTP con otplib (RFC 6238), secreto cifrado en reposo, 10 códigos de recuperación de un solo uso.
- SSO futuro con Google Workspace: OIDC que solo vincula a usuarios existentes (por email verificado); no crea cuentas.

## Consecuencias

- Una consulta por request para validar la sesión (con 20 usuarios es irrelevante; se puede cachear en Redis si hiciera falta).
- Revocación inmediata y simple, a diferencia de JWT.
