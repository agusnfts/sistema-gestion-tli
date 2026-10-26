#!/usr/bin/env bash
# Simulacro de restauración: restaura un backup en una base DESCARTABLE (otro contenedor, otra
# red) y verifica que la auditoría esté íntegra y que los archivos se puedan leer. No toca la
# base de producción. Hacerlo al menos una vez por mes y después de cada cambio de servidor.
#
# Uso (desde deploy/):  ./restore-drill.sh tli-FECHA /ruta/a/clave-privada-age.txt
# Los archivos del backup tienen que estar en $BACKUP_DIR (por defecto ./backups).
set -euo pipefail

NAME="${1:?Uso: restore-drill.sh tli-FECHA /ruta/clave.txt}"
# Ruta absoluta de una carpeta, en el formato que entiende Docker (en Git Bash, C:/…).
absdir() { (cd "$1" && { pwd -W 2>/dev/null || pwd; }); }
KEY="$(absdir "$(dirname "${2:?Falta la ruta de la clave privada}")")/$(basename "$2")"
BACKUP_DIR="${BACKUP_DIR:-$(absdir .)/backups}"
# En Git Bash, que no reescriba las rutas internas del contenedor (/app, /backups…).
export MSYS_NO_PATHCONV=1
NET=tli-drill
DB=tli-drill-db
PASS="drill-$(date +%s)"

cleanup() {
  docker rm -f "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "› Base descartable…"
docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" \
  -e POSTGRES_USER=tli -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB=tli \
  postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$DB" pg_isready -U tli -d tli >/dev/null 2>&1 && break
  sleep 1
done
# El dump trae los permisos del rol de la aplicación: se crea igual que en producción.
docker exec "$DB" psql -q -U tli -d tli -c "CREATE ROLE tli_app LOGIN PASSWORD '$PASS';"

echo "› Restaurando $NAME…"
docker run --rm --network "$NET" \
  -v "$BACKUP_DIR:/backups:ro" -v "$KEY:/run/backup-key:ro" \
  -e PGHOST="$DB" -e PGUSER=tli -e PGPASSWORD="$PASS" -e PGDATABASE=tli -e RESTORE_FILES=0 \
  --entrypoint restore.sh tli/backup:latest "$NAME"

echo "› Verificando archivos…"
docker run --rm -v "$BACKUP_DIR:/backups:ro" -v "$KEY:/run/backup-key:ro" \
  --entrypoint verify-files.sh tli/backup:latest "$NAME"

echo "› Verificando la base restaurada (auditoría y datos)…"
docker run --rm --network "$NET" \
  -e DATABASE_URL="postgresql://tli:$PASS@$DB:5432/tli?schema=public" \
  --entrypoint node -w /app/packages/db tli/app:latest dist/seed/verify-backup.js

echo "✔ Simulacro OK: el backup $NAME se puede restaurar."
