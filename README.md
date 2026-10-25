# Sistema de Gestión TLI

Sistema web interno del área de **Tecnología Logística e Innovación (TLI)** de **TML Logística**: ticketera de IT, gestión de problemas, mejoras WMS/TMS, maestro de clientes e integraciones, base de conocimiento y dashboard.

La documentación de diseño está en [`docs/`](docs/README.md) (arquitectura, modelo de datos, permisos, ADRs, wireframes, registro de tratamiento).

## Estado

| Fase | Contenido                                                                                    | Estado    |
| ---- | -------------------------------------------------------------------------------------------- | --------- |
| 0    | Diseño                                                                                       | ✅        |
| 1    | Base: monorepo, auth + MFA, usuarios, roles, auditoría, layout, CI                           | ✅        |
| 2a   | Ticketera: formulario guiado, estados, SLA, notificaciones, Mis tickets, bandeja de IT       | ✅        |
| 2b   | Adjuntos con antivirus, worker (BullMQ), mail opcional                                       | ✅        |
| 3    | Problemas: agrupar tickets por causa raíz, resolución en bloque, sugerencia de similares     | ✅        |
| 4    | Mejoras: kanban, derivación de tickets y problemas, cierre en bloque con mensaje             | ✅        |
| 5    | Clientes e integraciones: maestro, importación del F50, cotizaciones, documentos versionados | ✅        |
| 6    | Conocimiento: artículos con versiones, biblioteca con búsqueda en PDF, texto enriquecido     | ✅        |
| 7    | Dashboard: indicadores con período y responsable, cada número lleva a su lista               | ✅        |
| 8    | Producción                                                                                   | Pendiente |

## Stack

- **Monorepo** pnpm: `apps/api` (NestJS + Prisma), `apps/web` (React + Vite + Tailwind), `packages/shared` (schemas zod, permisos), `packages/db` (schema Prisma, migraciones, seeds).
- **PostgreSQL 16**, **Redis 7** (colas BullMQ) y **ClamAV** (antivirus de adjuntos).
- **Worker**: mismo código que la API en otro proceso (`apps/api/src/worker.main.ts`, ver [ADR 0014](docs/adr/0014-worker-same-codebase.md)).
- Tests: Vitest (unitarios y e2e de API), Playwright (e2e de interfaz). CI en GitHub Actions.

## Requisitos

- Node.js 22 o superior (`.nvmrc`).
- pnpm 10 (`corepack enable` lo instala según `packageManager`). En Windows, si `corepack enable` da `EPERM`, usá `npm install -g pnpm@10.15.1` (no requiere administrador).
- Docker Desktop (para PostgreSQL, Redis y ClamAV locales). ClamAV usa ~1,5 GB de RAM y la primera vez tarda unos minutos en descargar sus firmas.

## Levantar en local

```bash
pnpm install
pnpm dev
```

`pnpm dev` crea `.env` a partir de `.env.example` (con una clave MFA aleatoria) si no existe, levanta PostgreSQL, Redis y ClamAV con Docker, compila los paquetes compartidos, aplica migraciones, corre el seed de desarrollo y arranca la API, el worker y la web:

- Web: http://localhost:5173
- API: http://localhost:3000/api (healthcheck en `/api/health`)

### Usuarios de desarrollo

El seed de desarrollo crea `admin@tli.local`, `it@tli.local` y `usuario@tli.local`. La contraseña está en [`packages/db/src/seed/dev.ts`](packages/db/src/seed/dev.ts).

Admin e IT tienen que configurar MFA en el primer ingreso. Podés escanear el QR con cualquier app de autenticación, o abrir "No puedo escanear el código", copiar la clave y obtener el código con:

```bash
pnpm totp <CLAVE>
```

## Scripts

| Comando                                                                               | Qué hace                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                                                                            | Entorno completo en modo watch                                                    |
| `pnpm dev:infra` / `pnpm dev:infra:down`                                              | Levanta / baja PostgreSQL y Redis                                                 |
| `pnpm build`                                                                          | Compila todos los paquetes                                                        |
| `pnpm lint` · `pnpm format` · `pnpm typecheck`                                        | Calidad de código                                                                 |
| `pnpm test`                                                                           | Tests unitarios de todos los paquetes                                             |
| `pnpm test:e2e`                                                                       | Tests e2e de la API (necesita la base con migraciones)                            |
| `pnpm test:ui`                                                                        | Tests e2e de interfaz con Playwright (necesita la base con el seed de desarrollo) |
| `pnpm db:migrate`                                                                     | Aplica migraciones                                                                |
| `pnpm db:seed`                                                                        | Seed base (permisos, roles, catálogos iniciales). Seguro en producción            |
| `pnpm db:seed:dev`                                                                    | Seed base + usuarios de desarrollo                                                |
| `pnpm --filter @tli/db create-admin -- --email x@tml.com.ar --name "Nombre Apellido"` | Crea el primer Admin e imprime una contraseña temporal                            |
| `pnpm --filter @tli/db recover-access -- --email x@tml.com.ar`                        | Recupera el acceso de quien perdió el autenticador (ver abajo)                    |

Para la primera vez con Playwright: `pnpm --filter @tli/web exec playwright install chromium`.

Los tests e2e de la API pueden usar una base aparte definiendo `TEST_DATABASE_URL` (ver `.env.example`).

### Si perdés la app de autenticación y los códigos de recuperación

- **Si hay otro Admin:** en Administración → Usuarios puede usar _Resetear MFA_ (al ingresar configurás el autenticador de nuevo) y, si hace falta, _Resetear contraseña_ (te da una contraseña temporal).
- **Si sos el único Admin:** quien tenga acceso al servidor corre `pnpm --filter @tli/db recover-access -- --email tu@tml.com.ar`. Resetea el MFA, imprime una contraseña temporal (hay que cambiarla al ingresar), desbloquea la cuenta, cierra todas las sesiones y lo registra en la auditoría como _Acceso recuperado desde el servidor_. No reactiva usuarios deshabilitados.

Recomendación: tener al menos dos Admins y guardar los códigos de recuperación fuera del celular.

## Seguridad implementada

- Contraseñas con **argon2id**. Política: mínimo 12 caracteres, bloqueo de contraseñas comunes y de las que contienen el nombre o el email.
- **MFA TOTP obligatorio** para cualquier rol con permisos de gestión (Admin, IT o roles personalizados). Incluye 10 códigos de recuperación y protección contra la reutilización de códigos.
- **Bloqueo incremental** de la cuenta después de 5 intentos fallidos (15, 30, 60 min… hasta 24 h) y **rate limiting** por IP.
- **Sesiones del lado del servidor**: cookie `HttpOnly` + `SameSite` (`Secure` y `__Host-` en producción), expiración por inactividad y absoluta, rotación del token al loguear/verificar MFA/cambiar contraseña, revocación al deshabilitar usuarios o cambiar roles.
- **CSRF** con double-submit más chequeo de `Origin` ([ADR 0004](docs/adr/0004-same-origin-csrf.md)).
- **RBAC con permisos granulares** y deny-by-default: un endpoint sin política declarada se rechaza.
- **Auditoría append-only** con cadena de hashes verificable, protegida por un trigger en la base ([ADR 0008](docs/adr/0008-immutable-audit-log.md)).
- **Usuario de base con mínimo privilegio** (`tli_app`, solo DML). Las migraciones corren con el owner.
- Logs estructurados (pino) sin cookies, tokens ni credenciales.
- **Adjuntos**: tipo validado por contenido (no por extensión), 25 MB máximo, cuarentena hasta que ClamAV los libera, guardados fuera del webroot y servidos por la API con chequeo de permisos y CSP `sandbox` ([ADR 0006](docs/adr/0006-file-storage-antivirus.md)).
- **Mail opcional**: apagado por defecto; el SMTP se configura por variables de entorno (la contraseña nunca va a la base) y los mails llevan solo título, resumen y link.

## Diseño

La estética sigue el brochure institucional de TML 2026:

- **Logo:** versiones color y blanca, más el isotipo como favicon. Están en `apps/web/public`.
- **Tipografía:** Poppins, servida desde el propio sistema con `@fontsource`, sin pedidos a Google.
- **Colores:** azul marino `#0D3B70`, azul de títulos `#005CB9`, verde del isotipo `#69BF4A` y grises cálidos.
- **Pantallas de ingreso:** fondo azul con las formas geométricas de la tapa del brochure.

Los colores se definen como design tokens en [`apps/web/src/styles.css`](apps/web/src/styles.css).

## Despliegue

Se documenta en la Fase 8 (`docs/deploy.md`): Docker Compose de producción, Caddy con TLS, hardening del VPS y backups cifrados.

## Convenciones

- [Conventional Commits](https://www.conventionalcommits.org/) y versionado semántico.
- Código y nombres técnicos en inglés, textos de interfaz en español.
- Código organizado por dominio (`auth`, `users`, `roles`, `catalogs`, `audit`, …).
- Decisiones de arquitectura en [`docs/adr/`](docs/adr/).
