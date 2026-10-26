#!/usr/bin/env bash
# Backup cifrado de la base y de los archivos (adjuntos y documentos).
# Se cifra con la clave PÚBLICA de age: en el servidor no hay forma de descifrarlo.
# Deja en /backups:  tli-<fecha>.db.age  ·  tli-<fecha>.files.age  ·  tli-<fecha>.sha256
set -euo pipefail

: "${BACKUP_AGE_RECIPIENT:?Falta BACKUP_AGE_RECIPIENT (clave pública age1…)}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT=/backups
mkdir -p "$OUT"
cd "$OUT"

echo "› Base de datos…"
# Formato custom: comprimido y restaurable por partes. Los errores de pg_dump cortan el script.
pg_dump --format=custom --no-password | age --encrypt -r "$BACKUP_AGE_RECIPIENT" > "tli-$STAMP.db.age.tmp"
mv "tli-$STAMP.db.age.tmp" "tli-$STAMP.db.age"

echo "› Archivos…"
tar -C /data -czf - storage | age --encrypt -r "$BACKUP_AGE_RECIPIENT" > "tli-$STAMP.files.age.tmp"
mv "tli-$STAMP.files.age.tmp" "tli-$STAMP.files.age"

sha256sum "tli-$STAMP.db.age" "tli-$STAMP.files.age" > "tli-$STAMP.sha256"

echo "› Rotación: se borran los backups de más de $KEEP_DAYS días…"
find "$OUT" -maxdepth 1 -name 'tli-*' -type f -mtime +"$KEEP_DAYS" -print -delete

echo "OK · $(du -ch "tli-$STAMP".* | tail -1 | cut -f1) · tli-$STAMP"
