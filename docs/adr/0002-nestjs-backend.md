# ADR 0002 — NestJS como framework del backend

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Contexto

El backend necesita: organización por dominio, RBAC con permisos granulares aplicado de forma uniforme, inyección de implementaciones intercambiables (`EmailSender`, `StorageProvider`, futuros canales de entrada) y testabilidad.

## Opciones

1. **NestJS** — módulos, guards, interceptors, pipes y DI incluidos.
2. **Express modularizado** — más liviano, pero guards, DI, validación y estructura se construyen a mano.
3. Fastify puro — similar a Express en ese aspecto.

## Decisión

NestJS (adapter Express), con:

- Un módulo por dominio (`tickets`, `problems`, `improvements`, …).
- `PermissionsGuard` global + decorador `@RequirePermission()`. Endpoint sin decorador = denegado por defecto (salvo `@Public()` explícito).
- Validación con zod (`ZodValidationPipe`) usando los schemas de `packages/shared`, no class-validator, para tener una sola fuente de verdad con el front.
- Servicios de aplicación independientes de HTTP (ver [ADR 0013](0013-input-channels-extensibility.md)).
- Logging con `nestjs-pino`.

## Consecuencias

- Más convención y algo más de boilerplate que Express, a cambio de que la seguridad se aplique por defecto y no endpoint por endpoint.
- La curva de NestJS es baja para alguien que ya maneja TypeScript.
