# Herramientas de backup: pg_dump/pg_restore 16 y age (cifrado con clave pública).
FROM alpine:3.20
RUN apk add --no-cache bash postgresql16-client age tar gzip coreutils
COPY backup.sh restore.sh verify-files.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
