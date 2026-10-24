# ADR 0001 — Monorepo con pnpm workspaces

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Contexto

El sistema tiene tres aplicaciones (api, web, worker) que comparten tipos, schemas de validación, enums, lógica de SLA y el acceso a la base. Un solo equipo chico (TLI) mantiene todo.

## Decisión

Monorepo con pnpm workspaces:

```
apps/api       NestJS
apps/web       React + Vite
apps/worker    BullMQ
packages/shared  zod schemas, enums, tipos, calendario hábil / SLA (puro, sin I/O)
packages/db      schema Prisma, migraciones, cliente
```

- Orquestación de tareas con scripts de pnpm (`pnpm -r`). Si el CI se vuelve lento, se evalúa Turborepo.
- TypeScript con `tsconfig` base compartido y project references.
- Lockfile (`pnpm-lock.yaml`) commiteado. Versión de Node fijada con `.nvmrc` y `packageManager`.

## Consecuencias

- Un cambio en un schema se refleja en front y back en el mismo commit.
- La lógica de SLA vive en un solo lugar y la usan api (cálculo al crear/editar) y worker (chequeo periódico).
- Las imágenes Docker se construyen con `pnpm deploy` para incluir solo las dependencias de cada app.
