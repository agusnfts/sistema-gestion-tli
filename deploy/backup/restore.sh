#!/usr/bin/env bash
# Restaura un backup en la base indicada por PG* y (opcional) los archivos en /data/storage.
# Necesita la clave PRIVADA de age (montada en /run/backup-key, nunca guardada en el server).
# Uso: restore.sh <tli-FECHA>          (busca tli-FECHA.db.age y tli-FECHA.files.age en /backups)
set -euo pipefail

NAME="${1:?Uso: restore.sh tli-FECHA}"
KEY="${BACKUP_KEY_FILE:-/run/backup-key}"
cd /backups
[ -f "$KEY" ] || { echo "No está la clave privada en $KEY" >&2; exit 1; }

echo "› Verificando integridad (sha256)…"
sha256sum -c "$NAME.sha256"

echo "› Restaurando la base en $PGHOST/$PGDATABASE…"
# --clean: reemplaza lo que haya. Los permisos del rol de la app se restauran con el dump.
age --decrypt -i "$KEY" "$NAME.db.age" | pg_restore --clean --if-exists --no-password -d "$PGDATABASE"

if [ "${RESTORE_FILES:-1}" = "1" ]; then
  echo "› Restaurando archivos…"
  age --decrypt -i "$KEY" "$NAME.files.age" | tar -C /data -xzf -
fi
echo "OK · restaurado $NAME"
