# Registro de actividades de tratamiento

Marco: RGPD (art. 30) como referencia de buenas prácticas y **Ley 25.326** de Protección de Datos Personales (Argentina).

> **Pendiente legal:** la base de datos no está inscripta en el Registro Nacional de Bases de Datos de la AAIP. Este documento sirve como insumo para el trámite. Validar con el área legal de TML.

## Responsable

| Campo                       | Valor                                               |
| --------------------------- | --------------------------------------------------- |
| Responsable del tratamiento | TML Logística — _(razón social y CUIT a completar)_ |
| Área a cargo del sistema    | Tecnología Logística e Innovación (TLI)             |
| Contacto                    | _(a completar)_                                     |

## Actividades

### 1. Gestión de usuarios y acceso

| Campo         | Detalle                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Finalidad     | Autenticar y autorizar a empleados en el sistema                                                                  |
| Titulares     | Empleados de TML con usuario en el sistema (~20)                                                                  |
| Datos         | Nombre, email corporativo, área, depósito, hash de contraseña, secreto MFA (cifrado), IP y user-agent de sesiones |
| Base          | Relación laboral / interés legítimo en la seguridad de la información                                             |
| Destinatarios | Admin del sistema. Sin cesiones a terceros                                                                        |
| Conservación  | Mientras el usuario esté activo. Sesiones: hasta su expiración                                                    |
| Medidas       | argon2id, MFA, cifrado del secreto MFA, cookies seguras, auditoría                                                |

### 2. Gestión de tickets, problemas y mejoras

| Campo         | Detalle                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalidad     | Atender pedidos de soporte, propuestas e integraciones                                                                                                |
| Titulares     | Empleados solicitantes y personal de IT                                                                                                               |
| Datos         | Nombre del solicitante, contenido del ticket y comentarios, adjuntos (pueden incluir capturas con datos personales incidentales), tiempos registrados |
| Base          | Relación laboral / interés legítimo                                                                                                                   |
| Destinatarios | IT y Admin. El solicitante ve solo sus tickets                                                                                                        |
| Conservación  | Sin política automática por ahora. Anonimización manual a pedido del titular                                                                          |
| Medidas       | RBAC, comentarios internos separados, antivirus en adjuntos, URLs firmadas                                                                            |

### 3. Maestro de clientes e integraciones

| Campo         | Detalle                                                        |
| ------------- | -------------------------------------------------------------- |
| Finalidad     | Gestionar la relación técnica con clientes y sus integraciones |
| Titulares     | Contactos comerciales y de sistemas de clientes                |
| Datos         | Nombre, email, teléfono, rol del contacto                      |
| Base          | Ejecución de contrato con el cliente / interés legítimo        |
| Destinatarios | IT y Admin                                                     |
| Conservación  | Mientras exista la relación comercial                          |
| Medidas       | RBAC, auditoría de cambios                                     |

### 4. Avisos de actualización de sistemas

| Campo         | Detalle                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Finalidad     | Avisar a la operación cuándo se actualiza un sistema y qué impacto tiene                          |
| Titulares     | Personal de TML (con o sin usuario del sistema) incluido en listas de distribución                |
| Datos         | Email (personal o de grupo) y nombre de la lista                                                  |
| Base          | Interés legítimo (continuidad operativa)                                                          |
| Destinatarios | IT y Admin cargan las listas; el mail lo recibe cada persona por separado                         |
| Conservación  | Mientras la persona trabaje en el área de la lista; se quita al anonimizar                        |
| Medidas       | RBAC (`announcement.manage`), un mail por destinatario (sin ver a los demás), auditoría sin mails |

### 5. Auditoría y logs

| Campo         | Detalle                                                        |
| ------------- | -------------------------------------------------------------- |
| Finalidad     | Seguridad, trazabilidad y cumplimiento                         |
| Datos         | ID de usuario, acción, fecha, IP                               |
| Base          | Interés legítimo / obligación de seguridad (art. 9 Ley 25.326) |
| Destinatarios | Admin                                                          |
| Conservación  | A definir (sugerido: 2 años)                                   |
| Medidas       | Log append-only con cadena de hashes, sin datos sensibles      |

## Derechos de los titulares

- **Acceso / portabilidad:** Admin exporta los datos del titular en JSON (`privacy.export`). Queda auditado.
- **Cómo se hace:** Administración → Usuarios → menú de la persona → "Exportar datos (JSON)" o "Anonimizar…". La anonimización no reescribe el texto libre de tickets y comentarios: si contiene datos personales del titular, IT lo edita a mano.
- **Supresión / anonimización:** Admin anonimiza al titular (`privacy.anonymize`): nombre y email se reemplazan, se borran sesiones y MFA; tickets y auditoría se conservan referenciando un usuario anonimizado. Queda auditado.
- Plazo de respuesta: 10 días corridos (acceso, Ley 25.326 art. 14) y 5 días hábiles (rectificación/supresión, art. 16).

## Transferencias internacionales

Pendiente de la decisión de ubicación del VPS y del destino de los backups (ver [deploy](deploy.md#pendiente-de-definir)).

- **VPS en Argentina:** no hay transferencia internacional.
- **VPS fuera de Argentina:** preferir un país con nivel de protección adecuado según la AAIP (por ejemplo, los de la Unión Europea). Si no lo es, firmar con el proveedor las cláusulas contractuales modelo (Disposición AAIP 60-E/2016) y dejar constancia acá.
- **Backups:** viajan cifrados con age (clave pública en el servidor, privada fuera). El proveedor del almacenamiento no puede leerlos; igual se registra su país.

Hasta que se defina, este registro sigue abierto. La inscripción de la base ante la AAIP está pendiente (decisión del área).

## Encargados del tratamiento

| Encargado                       | Servicio         | Estado    |
| ------------------------------- | ---------------- | --------- |
| Proveedor de VPS                | Hosting          | A definir |
| Proveedor de storage de backups | Backups cifrados | A definir |
