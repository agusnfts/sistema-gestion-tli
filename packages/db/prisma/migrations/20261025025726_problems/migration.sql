-- Fase 3: problemas y búsqueda por similitud (ADR 0005).

-- Extensiones: trigramas (similitud de textos) y quitar acentos.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Configuración de búsqueda en español que ignora acentos ("impresión" = "impresion").
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'tli_spanish') THEN
    CREATE TEXT SEARCH CONFIGURATION tli_spanish (COPY = spanish);
    ALTER TEXT SEARCH CONFIGURATION tli_spanish
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ROOT_CAUSE_IDENTIFIED', 'RESOLVED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "problemId" UUID,
-- Columna generada: el asunto pesa más que la descripción.
ADD COLUMN     "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('tli_spanish', coalesce("subject", '')), 'A') ||
  setweight(to_tsvector('tli_spanish', coalesce("description", '')), 'B')
) STORED;

-- CreateTable
CREATE TABLE "Problem" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "rootCause" TEXT,
    "workaround" TEXT,
    "permanentSolution" TEXT,
    "status" "ProblemStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" UUID,
    "createdById" UUID NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('tli_spanish', coalesce("title", '')), 'A') ||
      setweight(to_tsvector('tli_spanish', coalesce("description", '')), 'B') ||
      setweight(to_tsvector('tli_spanish', coalesce("rootCause", '')), 'C')
    ) STORED,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Problem_number_key" ON "Problem"("number");

-- CreateIndex
CREATE INDEX "Problem_status_idx" ON "Problem"("status");

-- CreateIndex
CREATE INDEX "Problem_searchVector_idx" ON "Problem" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Problem_title_trgm_idx" ON "Problem" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Ticket_problemId_idx" ON "Ticket"("problemId");

-- CreateIndex
CREATE INDEX "Ticket_searchVector_idx" ON "Ticket" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Ticket_subject_trgm_idx" ON "Ticket" USING GIN ("subject" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
