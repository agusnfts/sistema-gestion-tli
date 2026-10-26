#!/usr/bin/env bash
# Verifica que el archivo de adjuntos de un backup se pueda descifrar y leer entero.
# Uso: verify-files.sh <tli-FECHA>
set -euo pipefail
NAME="${1:?Uso: verify-files.sh tli-FECHA}"
KEY="${BACKUP_KEY_FILE:-/run/backup-key}"
cd /backups
sha256sum -c "$NAME.sha256"
COUNT="$(age --decrypt -i "$KEY" "$NAME.files.age" | tar -tzf - | grep -vc '/$' || true)"
echo "OK · archivos legibles: $COUNT"
