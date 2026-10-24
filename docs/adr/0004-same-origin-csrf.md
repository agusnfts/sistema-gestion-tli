# ADR 0004 — Mismo origen y protección CSRF

- **Estado:** Aceptado (revisado en Fase 1)
- **Fecha:** 2026-10-24

## Decisión

- La SPA y la API se sirven desde el mismo origen detrás de Caddy (`/` y `/api`). Sin CORS. En desarrollo, Vite hace proxy de `/api`.
- Cookie de sesión `SameSite=Lax`, `HttpOnly`, `Secure` en producción (prefijo `__Host-`).
- **CSRF por double-submit con cookie `HttpOnly`** (cambio respecto del borrador, que proponía token sincronizado en la sesión):
  - `GET /api/auth/csrf` emite un token aleatorio de 256 bits en una cookie `HttpOnly` + `SameSite=Strict` y lo devuelve en el body.
  - La SPA guarda el token en memoria y lo manda en `X-CSRF-Token` en todo método que modifica estado.
  - El guard global compara cookie y header en tiempo constante. Además, si llega `Origin`, tiene que ser `APP_ORIGIN`.
  - Motivo del cambio: el token sincronizado no cubre el login (todavía no hay sesión) y obliga a reemitirlo cada vez que la sesión rota (login, MFA, cambio de contraseña). El double-submit cubre todos los casos con un solo mecanismo: un atacante de otro origen no puede leer la cookie ni el body, y `SameSite=Strict` impide que la cookie viaje en requests cross-site.
- Headers: la API responde con CSP `default-src 'none'; frame-ancestors 'none'`, HSTS (en producción), `X-Content-Type-Options`, `Referrer-Policy`, etc. vía helmet. La CSP de la SPA (`default-src 'self'`, sin `unsafe-inline` en scripts, `frame-ancestors 'none'`, `object-src 'none'`) la sirve Caddy en Fase 8.
- El visor de PDF se servirá desde el mismo origen (pdf.js), sin embeber orígenes externos.

## Consecuencias

- Defensa en profundidad: SameSite + token + chequeo de Origin.
- Cubierto por tests e2e (`apps/api/test/auth.e2e.test.ts`).
