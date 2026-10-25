# ADR 0005 — Búsqueda full-text y similitud en PostgreSQL

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Contexto

Se necesita: búsqueda en español sobre tickets, problemas, artículos y contenido de documentos (con página); sugerencia de tickets/problemas similares; sugerencia de artículos públicos al cargar un ticket. Volumen chico (20 usuarios, miles de tickets, cientos de documentos).

## Decisión

- PostgreSQL nativo, sin motor externo (Elasticsearch/Meilisearch no se justifican a este volumen).
- Extensiones: `unaccent`, `pg_trgm`.
- Configuración de texto propia `tli_spanish` = `spanish` + `unaccent`, creada en migración SQL.
- Columnas `searchVector tsvector` generadas (`GENERATED ALWAYS AS ... STORED`) con pesos (título A, cuerpo B), índice GIN.
- Similitud: combinación de `ts_rank_cd` y `similarity()` de trigramas sobre el asunto/título.
- Prisma no soporta `tsvector`: la columna se declara como `Unsupported("tsvector")` y las consultas de búsqueda se escriben con `$queryRaw` tipado, encapsuladas en un repositorio por dominio.
- Los resultados de documentos se buscan sobre `ContentChunk`, que tiene `pageNumber`, para linkear a la página del PDF.
- Toda búsqueda filtra por visibilidad y permisos del actor **dentro de la consulta**.

## Consecuencias

- Menos infraestructura. Las migraciones con SQL manual deben quedar documentadas y testeadas.

## Implementación (Fase 3)

- Extensiones `pg_trgm` y `unaccent`, y configuración `tli_spanish` (= `spanish` + `unaccent`), creadas en la migración `problems`.
- Columnas `searchVector` generadas (`GENERATED ALWAYS AS … STORED`) en `Ticket` (asunto A, descripción B) y `Problem` (título A, descripción B, causa raíz C), con índice GIN. Índices trigram (`gin_trgm_ops`) sobre `Ticket.subject` y `Problem.title`.
- En Prisma se declaran como `Unsupported("tsvector")? @default(dbgenerated("…"))` con la misma expresión que devuelve la introspección: así `prisma migrate` no detecta diferencias ni intenta borrarlas.
- `SimilarityService` arma una consulta OR con las palabras normalizadas del texto (`tsvector_to_array`) y combina `ts_rank` con `similarity()` del título (umbral 0,3). Devuelve hasta 5 tickets y 5 problemas (primero los abiertos). Solo sugiere: vincular es siempre una decisión de IT.
- La migración requiere permiso para `CREATE EXTENSION` (en producción, correrla con el owner de la base).
