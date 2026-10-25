-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "address" TEXT,
ADD COLUMN     "f50Folio" TEXT;

-- AlterTable
ALTER TABLE "ClientContact" ADD COLUMN     "role" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_f50Folio_key" ON "Client"("f50Folio");

