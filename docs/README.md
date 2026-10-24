# Documentación — Sistema de Gestión TLI

Sistema web interno del área de Tecnología Logística e Innovación (TLI) de TML Logística.

| Documento                                                  | Contenido                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| [architecture.md](architecture.md)                         | Arquitectura, componentes, flujos principales              |
| [data-model.md](data-model.md)                             | Entidades, relaciones, enums y máquinas de estado          |
| [permissions.md](permissions.md)                           | Permisos granulares y matriz por rol                       |
| [phases.md](phases.md)                                     | Plan por fases y decisiones cerradas                       |
| [wireframes.md](wireframes.md)                             | Wireframes de baja fidelidad de las pantallas principales  |
| [data-processing-register.md](data-processing-register.md) | Registro de actividades de tratamiento (RGPD / Ley 25.326) |
| [adr/](adr/)                                               | Architecture Decision Records                              |

## ADRs

| #                                                | Título                                                   | Estado   |
| ------------------------------------------------ | -------------------------------------------------------- | -------- |
| [0001](adr/0001-monorepo-pnpm.md)                | Monorepo con pnpm workspaces                             | Aceptado |
| [0002](adr/0002-nestjs-backend.md)               | NestJS como framework del backend                        | Aceptado |
| [0003](adr/0003-server-side-sessions.md)         | Sesiones del lado del servidor (no JWT)                  | Aceptado |
| [0004](adr/0004-same-origin-csrf.md)             | Mismo origen y protección CSRF                           | Aceptado |
| [0005](adr/0005-postgres-search.md)              | Búsqueda full-text y similitud en PostgreSQL             | Aceptado |
| [0006](adr/0006-file-storage-antivirus.md)       | Almacenamiento de archivos y pipeline antivirus          | Aceptado |
| [0007](adr/0007-sla-engine.md)                   | Motor de SLA en horario hábil                            | Aceptado |
| [0008](adr/0008-immutable-audit-log.md)          | Log de auditoría inmutable                               | Aceptado |
| [0009](adr/0009-rich-text.md)                    | Texto enriquecido y sanitización                         | Aceptado |
| [0010](adr/0010-text-extraction-ocr.md)          | Extracción de texto y OCR de documentos                  | Aceptado |
| [0011](adr/0011-ai-readiness-chunks.md)          | Fragmentos de contenido preparados para IA               | Aceptado |
| [0012](adr/0012-infrastructure-sizing.md)        | Infraestructura y dimensionamiento                       | Aceptado |
| [0013](adr/0013-input-channels-extensibility.md) | Canales de entrada extensibles (mail y chatbot a futuro) | Aceptado |
