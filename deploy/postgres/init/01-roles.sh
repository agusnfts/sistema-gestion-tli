#!/bin/sh
# Rol de aplicación con mínimo privilegio (solo DML) para producción. Corre una sola vez, al
# crear el volumen de la base. La contraseña viene de APP_DB_PASSWORD (deploy/.env).
set -eu

if [ -z "${APP_DB_PASSWORD:-}" ]; then
  echo "Falta APP_DB_PASSWORD" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE tli_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE tli TO tli_app;
GRANT USAGE ON SCHEMA public TO tli_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tli IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tli_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tli IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tli_app;
SQL
