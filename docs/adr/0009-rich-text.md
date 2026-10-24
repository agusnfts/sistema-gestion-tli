# ADR 0009 — Texto enriquecido y sanitización

- **Estado:** Aceptado
- **Fecha:** 2026-10-24

## Decisión

- Editor TipTap en el front (accesible, con soporte de pegado de imágenes que se suben como adjuntos).
- Se almacena HTML. El backend lo sanitiza **siempre** al guardar con `sanitize-html` y una lista blanca: párrafos, títulos h2–h4, negrita, cursiva, listas, enlaces (`http`, `https`, `mailto`, con `rel="noopener noreferrer"`), código, citas, tablas simples e imágenes que apunten a adjuntos internos (`/api/files/...`).
- Sin estilos inline, sin `iframe`, sin atributos `on*`.
- El front renderiza el HTML ya sanitizado; la CSP es la segunda barrera.
- Se usa en: descripción y comentarios de tickets, mejoras, problemas, artículos y "Cómo funciona" de integraciones.

## Consecuencias

- El mismo sanitizador se usará para contenido que ingrese por mail o chatbot en el futuro.
