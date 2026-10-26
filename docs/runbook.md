# Runbook de incidentes

Qué hacer cuando algo se rompe. Todo se corre desde `/opt/tli/deploy` en el servidor.
Ante un incidente de seguridad, **primero contener, después investigar**, y dejar registro de cada paso (hora, quién, qué).

## El sistema no responde

1. `docker compose ps`: ¿algún servicio `unhealthy` o reiniciándose?
2. `docker compose logs --tail 200 api` (o el servicio que falle).
3. Causas habituales:
   - **Disco lleno:** `df -h`. Liberar con `docker image prune -f` y revisar `BACKUP_DIR`.
   - **Memoria:** `docker stats`. ClamAV usa ~1,5 GB; si el VPS se queda sin RAM, sumar swap.
   - **Certificado:** `docker compose logs caddy` (DNS mal apuntado o puerto 80 cerrado).
4. `docker compose up -d` vuelve a levantar lo que esté caído.

## Los adjuntos quedan "en análisis"

ClamAV no está listo (la primera vez tarda ~10 min en bajar firmas) o se cayó: `docker compose logs clamav`. Al volver, el worker reintenta solo. Mientras tanto ningún archivo se sirve (es lo esperado).

## Sospecha de cuenta comprometida

1. Administración → Usuarios → **Deshabilitar** (cierra todas sus sesiones al instante).
2. **Resetear contraseña** y **Resetear MFA**.
3. Administración → Auditoría: filtrar por la persona y revisar accesos (IP, horario) y acciones.
4. Si era Admin o IT: revisar cambios de roles, usuarios creados y configuración en la auditoría.
5. Habilitar de nuevo cuando la persona confirme el nuevo acceso.

## Sospecha de compromiso del servidor

1. **Contener:** `docker compose stop caddy` (corta el acceso externo) y conservar el estado (no borrar nada; snapshot del VPS si el proveedor lo permite).
2. Verificar la integridad de la auditoría (Administración → Auditoría → Verificar, o `restore-drill.sh` con el último backup).
3. Rotar secretos: contraseñas de la base (`OWNER_DB_PASSWORD`, `APP_DB_PASSWORD`), SMTP, y cerrar todas las sesiones (`docker compose exec postgres psql -U tli -d tli -c "UPDATE \"Session\" SET \"revokedAt\" = now() WHERE \"revokedAt\" IS NULL;"`).
4. Si hay dudas sobre el servidor, reconstruir en uno nuevo y restaurar el último backup bueno (`docs/deploy.md` → Restaurar).
5. Rotar `MFA_ENCRYPTION_KEY` solo si se filtró: implica que todos reconfiguren MFA (resetear MFA a todos).

## Incidente con datos personales

Ley 25.326 y, si aplica, RGPD (72 h para notificar a la autoridad si hay riesgo para las personas).

1. Determinar qué datos, de quiénes y desde cuándo (auditoría, logs de Caddy).
2. Informar a la dirección y al responsable del tratamiento ([registro](data-processing-register.md)).
3. Evaluar la notificación a la AAIP y a los afectados; dejar constancia de la decisión.
4. Registrar el incidente y las medidas tomadas.

## Se perdió la clave MFA de cifrado (`MFA_ENCRYPTION_KEY`)

Los usuarios con MFA no van a poder ingresar. Poner una clave nueva en `.env`, reiniciar, y resetear el MFA de cada persona (o `recover-access` para el primer Admin).

## Se perdió la clave privada de los backups

Los backups existentes no se pueden restaurar. Generar un par nuevo de inmediato, actualizar `BACKUP_AGE_RECIPIENT`, hacer un backup manual y guardar la clave privada nueva en dos lugares.

## Restaurar desde backup

Ver [`docs/deploy.md` → Restaurar](deploy.md#restaurar-desastre). Después de restaurar: verificar la auditoría y avisar a los usuarios qué período de datos se perdió (desde el último backup).
