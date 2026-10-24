# ADR 0011 — Fragmentos de contenido preparados para IA

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Contexto

La IA (chatbot de consulta sobre WMS/TMS/integraciones) está fuera de alcance, pero se quiere sumar después agregando un módulo, sin migraciones grandes.

## Decisión

- Tabla `ContentChunk` desde la Fase 6 con: origen (artículo, documento o "cómo funciona" de integración), versión, página, orden, texto, visibilidad, `contentHash`, `tokenCount`, `searchVector`.
- Fragmentación: ~800 tokens con solapamiento de ~100, respetando límites de párrafo y de página (un fragmento nunca cruza páginas, para poder citar la página).
- Reproceso automático (job `rechunk`) cuando: se sube una nueva versión, se publica/edita un artículo, cambia "cómo funciona" de una integración o cambia la visibilidad. Se reemplazan los fragmentos de la versión anterior en una transacción.
- La búsqueda full-text actual ya usa esta tabla, así que se ejercita desde el día uno.
- **No** se instala pgvector ni nada de IA ahora.

## Cómo se conectaría la IA (a futuro)

1. Migración aditiva: `CREATE EXTENSION vector;` y tabla `ChunkEmbedding(chunkId FK, model, dimensions, embedding vector(N), createdAt)` con índice HNSW. Una tabla aparte permite convivir varios modelos y reindexar sin tocar `ContentChunk`.
2. Job `embed-chunk` disparado por los mismos eventos que `rechunk`; `contentHash` evita recalcular fragmentos sin cambios.
3. Búsqueda híbrida: vector + full-text existente, fusionadas (RRF).
4. **Visibilidad obligatoria en la consulta:** el filtro por `visibility` y permisos del actor se aplica en SQL antes de pasarle contexto al modelo. Un Usuario nunca recibe fragmentos internos.
5. Las respuestas citan documento + página usando `pageNumber`.

## Consecuencias

- Agregar IA = un módulo + una migración aditiva + un job.
