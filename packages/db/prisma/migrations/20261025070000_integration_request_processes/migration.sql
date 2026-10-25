-- Los pedidos de integración pasan de un proceso a varios: extraFields.process -> processes[].
UPDATE "Ticket"
SET "extraFields" = ("extraFields" - 'process')
  || jsonb_build_object('processes', jsonb_build_array("extraFields"->'process'))
WHERE "type" = 'INTEGRATION' AND "extraFields" ? 'process';
