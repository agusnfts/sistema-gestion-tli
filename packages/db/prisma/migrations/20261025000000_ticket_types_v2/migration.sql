-- Nuevos tipos de ticket: Soporte, Automatización, Integración y Acceso.
-- Migración de datos:
--   Problema y Pedido            -> Soporte (o Acceso si la categoría era Accesos)
--   Propuesta de mejora          -> Automatización
--   Pedido de integración        -> Integración
CREATE TYPE "TicketType_new" AS ENUM ('SUPPORT', 'AUTOMATION', 'INTEGRATION', 'ACCESS');

ALTER TABLE "Ticket" ALTER COLUMN "type" TYPE "TicketType_new" USING (
  CASE
    WHEN "category"::text = 'ACCESS' AND "type"::text IN ('INCIDENT', 'REQUEST') THEN 'ACCESS'
    WHEN "type"::text IN ('INCIDENT', 'REQUEST') THEN 'SUPPORT'
    WHEN "type"::text = 'IMPROVEMENT_PROPOSAL' THEN 'AUTOMATION'
    WHEN "type"::text = 'INTEGRATION_REQUEST' THEN 'INTEGRATION'
  END
)::"TicketType_new";

DROP TYPE "TicketType";
ALTER TYPE "TicketType_new" RENAME TO "TicketType";

-- En los accesos la categoría es el sistema; la categoría "Accesos" ya no se ofrece.
UPDATE "Ticket" SET "category" = 'OTHER' WHERE "type" = 'ACCESS' AND "category" = 'ACCESS';
