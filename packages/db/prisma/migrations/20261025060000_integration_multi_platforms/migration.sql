-- Una integración puede cubrir varios procesos y varios sistemas nuestros, y vincularse a
-- plataformas externas (e-commerce, ERP). Se conserva el proceso y el sistema que ya tenían.

-- CreateEnum
CREATE TYPE "PlatformCategory" AS ENUM ('ECOMMERCE', 'ERP', 'OTHER');

-- Procesos y sistemas: de un valor a una lista, copiando el valor actual.
ALTER TABLE "Integration" ADD COLUMN "processes" "IntegrationProcess"[],
ADD COLUMN "systems" "IntegrationSystem"[];

UPDATE "Integration" SET "processes" = ARRAY["process"], "systems" = ARRAY["system"];

ALTER TABLE "Integration" DROP COLUMN "process",
DROP COLUMN "system";

-- CreateTable
CREATE TABLE "Platform" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PlatformCategory" NOT NULL DEFAULT 'OTHER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_IntegrationToPlatform" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_IntegrationToPlatform_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Platform_name_key" ON "Platform"("name");

-- CreateIndex
CREATE INDEX "_IntegrationToPlatform_B_index" ON "_IntegrationToPlatform"("B");

-- AddForeignKey
ALTER TABLE "_IntegrationToPlatform" ADD CONSTRAINT "_IntegrationToPlatform_A_fkey" FOREIGN KEY ("A") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IntegrationToPlatform" ADD CONSTRAINT "_IntegrationToPlatform_B_fkey" FOREIGN KEY ("B") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
