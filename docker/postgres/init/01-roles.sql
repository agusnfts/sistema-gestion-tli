-- Rol de aplicación con mínimo privilegio: solo DML sobre las tablas que crea el owner (tli).
-- Las migraciones corren con el owner; la api y el worker se conectan como tli_app.
-- Contraseña solo para desarrollo local.
CREATE ROLE tli_app LOGIN PASSWORD 'tli_app_dev';
GRANT CONNECT ON DATABASE tli TO tli_app;
GRANT USAGE ON SCHEMA public TO tli_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tli IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tli_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tli IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tli_app;
