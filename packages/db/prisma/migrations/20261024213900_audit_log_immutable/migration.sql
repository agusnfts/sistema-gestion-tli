-- ADR 0008: el log de auditoría es append-only.
-- El trigger rechaza UPDATE y DELETE sin importar el rol; TRUNCATE se bloquea con un trigger de sentencia.
CREATE OR REPLACE FUNCTION audit_log_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es append-only: % no permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_mutation();

-- Defensa adicional por privilegios para el rol de aplicación, si existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tli_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM tli_app;
  END IF;
END $$;
