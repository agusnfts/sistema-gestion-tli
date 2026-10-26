# Permisos y roles

Los permisos son granulares y se asignan a roles. El código chequea **permisos**, nunca roles:

```ts
@RequirePermission('ticket.manage')
```

Los permisos `*.own` agregan además un filtro por dueño en el servicio (ej. `requesterId = actor.id`), no solo en el guard. Un usuario puede tener varios roles; los permisos se suman.

## Matriz

| Permiso                   | Descripción                                                      | Admin | IT  | Usuario |
| ------------------------- | ---------------------------------------------------------------- | :---: | :-: | :-----: |
| `ticket.create`           | Crear tickets desde el formulario                                |   ✓   |  ✓  |    ✓    |
| `ticket.read.own`         | Ver sus propios tickets                                          |   ✓   |  ✓  |    ✓    |
| `ticket.comment.own`      | Comentar (público) sus propios tickets, reabrir si está Resuelto |   ✓   |  ✓  |    ✓    |
| `ticket.read.all`         | Ver todos los tickets                                            |   ✓   |  ✓  |    –    |
| `ticket.manage`           | Asignar, priorizar, cambiar estado, derivar, editar              |   ✓   |  ✓  |    –    |
| `ticket.comment.internal` | Comentarios internos                                             |   ✓   |  ✓  |    –    |
| `ticket.time.log`         | Registrar tiempo invertido                                       |   ✓   |  ✓  |    –    |
| `problem.read`            | Ver problemas                                                    |   ✓   |  ✓  |    –    |
| `problem.manage`          | Crear, vincular, resolver en bloque                              |   ✓   |  ✓  |    –    |
| `improvement.read`        | Ver mejoras                                                      |   ✓   |  ✓  |    –    |
| `improvement.manage`      | Crear desde tickets, editar, mover en kanban, cerrar             |   ✓   |  ✓  |    –    |
| `client.read`             | Ver maestro de clientes                                          |   ✓   |  ✓  |    –    |
| `client.manage`           | Alta/edición de clientes y contactos                             |   ✓   |  ✓  |    –    |
| `client.import`           | Importar F50                                                     |   ✓   |  ✓  |    –    |
| `integration.read`        | Ver integraciones, cotizaciones, "cómo funciona"                 |   ✓   |  ✓  |    –    |
| `integration.manage`      | Alta/edición de integraciones y cotizaciones                     |   ✓   |  ✓  |    –    |
| `kb.read.public`          | Ver artículos y documentos públicos                              |   ✓   |  ✓  |    ✓    |
| `kb.read.internal`        | Ver artículos y documentos internos                              |   ✓   |  ✓  |    –    |
| `kb.manage`               | Crear/editar artículos y documentos, subir versiones             |   ✓   |  ✓  |    –    |
| `kb.publish`              | Publicar y cambiar visibilidad                                   |   ✓   |  ✓  |    –    |
| `document.bulk_upload`    | Carga masiva de documentos                                       |   ✓   |  ✓  |    –    |
| `dashboard.view`          | Ver el dashboard                                                 |   ✓   |  ✓  |    –    |
| `announcement.manage`     | Avisos de actualización y listas de distribución                 |   ✓   |  ✓  |    –    |
| `catalog.manage`          | Áreas, depósitos, proveedores, sistemas, categorías              |   ✓   |  –  |    –    |
| `user.manage`             | Alta, baja, reseteo de contraseña y MFA                          |   ✓   |  –  |    –    |
| `role.manage`             | Crear roles y asignar permisos                                   |   ✓   |  –  |    –    |
| `settings.manage`         | SLA, horario hábil, feriados, cierre automático, mail            |   ✓   |  –  |    –    |
| `audit.read`              | Consultar el log de auditoría                                    |   ✓   |  –  |    –    |
| `privacy.export`          | Exportar datos de un titular                                     |   ✓   |  –  |    –    |
| `privacy.anonymize`       | Anonimizar datos de un titular                                   |   ✓   |  –  |    –    |

## Reglas transversales

- **MFA obligatorio** para cualquier usuario con al menos un permiso fuera de la columna Usuario. Sin MFA configurado, la sesión solo permite ir a la pantalla de configuración de MFA.
- Las acciones de `user.manage`, `role.manage`, `settings.manage`, `privacy.*` y cambios de permisos quedan en auditoría.
- El usuario normal recibe aviso de que su ticket "derivó en una mejora/integración" y ve el comentario de cierre, pero **no** accede a la mejora ni a la integración.
- Un rol futuro "Comercial" se arma con `client.read` + `integration.read`, sin cambiar código.
