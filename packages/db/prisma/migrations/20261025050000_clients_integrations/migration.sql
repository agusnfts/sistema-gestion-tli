-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'ONBOARDING', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('COMMERCIAL', 'SYSTEMS', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationCounterpart" AS ENUM ('CLIENT', 'CARRIER', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationProcess" AS ENUM ('INBOUND_ORDERS', 'OUTBOUND_ORDERS', 'STOCK', 'DELIVERY_NOTES', 'CONFIRMATIONS', 'TRACKING', 'LABELS', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationSystem" AS ENUM ('WMS', 'TMS', 'TYT', 'ROUTING');

-- CreateEnum
CREATE TYPE "IntegrationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "IntegrationChannel" AS ENUM ('FTP_SFTP', 'NETWORK_FOLDER', 'EMAIL', 'API', 'EDI', 'MANUAL');

-- CreateEnum
CREATE TYPE "IntegrationFormat" AS ENUM ('CSV', 'FIXED_WIDTH_TXT', 'XML', 'JSON', 'EXCEL');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('PENDING_SURVEY', 'PENDING_QUOTE', 'QUOTED', 'IN_DEVELOPMENT', 'COMPLETED', 'NOT_DONE');

-- CreateEnum
CREATE TYPE "NotDoneReason" AS ENUM ('CLIENT_REJECTED_COST', 'TML_REJECTED_COST', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "DocumentEntity" AS ENUM ('CLIENT', 'INTEGRATION', 'IMPROVEMENT', 'ARTICLE');

-- CreateEnum
CREATE TYPE "DocumentLinkType" AS ENUM ('SPECIFICATION', 'LAYOUT', 'SAMPLE_FILE', 'MINUTES', 'QUOTE', 'MANUAL', 'OTHER');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "documentVersionId" UUID,
ADD COLUMN     "integrationActionId" UUID,
ADD COLUMN     "integrationQuoteId" UUID;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "integrationId" UUID;

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "shortName" TEXT,
    "cuit" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "kind" "ContactKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "counterpartType" "IntegrationCounterpart" NOT NULL,
    "clientId" UUID,
    "counterpartName" TEXT,
    "process" "IntegrationProcess" NOT NULL,
    "system" "IntegrationSystem" NOT NULL,
    "direction" "IntegrationDirection",
    "channel" "IntegrationChannel",
    "format" "IntegrationFormat",
    "frequency" TEXT,
    "location" TEXT,
    "requiresDevelopment" BOOLEAN NOT NULL DEFAULT true,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'PENDING_SURVEY',
    "notDoneReason" "NotDoneReason",
    "notDoneNotes" TEXT,
    "howItWorks" TEXT NOT NULL DEFAULT '',
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "estimatedHours" DECIMAL(8,1),
    "actualHours" DECIMAL(8,1),
    "actualCost" DECIMAL(14,2),
    "startDate" DATE,
    "targetDate" DATE,
    "goLiveDate" DATE,
    "ownerId" UUID,
    "closingMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRevision" (
    "id" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "howItWorks" TEXT NOT NULL,
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationQuote" (
    "id" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "estimatedHours" DECIMAL(8,1),
    "quotedAt" DATE NOT NULL,
    "notes" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationAction" (
    "id" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "currentVersionId" UUID,
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "entityType" "DocumentEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "linkType" "DocumentLinkType" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClientToWarehouse" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ClientToWarehouse_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ClientToImprovement" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ClientToImprovement_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_cuit_key" ON "Client"("cuit");

-- CreateIndex
CREATE INDEX "Client_legalName_idx" ON "Client"("legalName");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_number_key" ON "Integration"("number");

-- CreateIndex
CREATE INDEX "Integration_status_idx" ON "Integration"("status");

-- CreateIndex
CREATE INDEX "Integration_clientId_idx" ON "Integration"("clientId");

-- CreateIndex
CREATE INDEX "IntegrationRevision_integrationId_createdAt_idx" ON "IntegrationRevision"("integrationId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationQuote_integrationId_idx" ON "IntegrationQuote"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationAction_integrationId_createdAt_idx" ON "IntegrationAction"("integrationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_currentVersionId_key" ON "Document"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "DocumentLink_entityType_entityId_idx" ON "DocumentLink"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_documentId_entityType_entityId_key" ON "DocumentLink"("documentId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "_ClientToWarehouse_B_index" ON "_ClientToWarehouse"("B");

-- CreateIndex
CREATE INDEX "_ClientToImprovement_B_index" ON "_ClientToImprovement"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_documentVersionId_key" ON "Attachment"("documentVersionId");

-- CreateIndex
CREATE INDEX "Attachment_integrationActionId_idx" ON "Attachment"("integrationActionId");

-- CreateIndex
CREATE INDEX "Attachment_integrationQuoteId_idx" ON "Attachment"("integrationQuoteId");

-- CreateIndex
CREATE INDEX "Ticket_integrationId_idx" ON "Ticket"("integrationId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_integrationActionId_fkey" FOREIGN KEY ("integrationActionId") REFERENCES "IntegrationAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_integrationQuoteId_fkey" FOREIGN KEY ("integrationQuoteId") REFERENCES "IntegrationQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRevision" ADD CONSTRAINT "IntegrationRevision_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRevision" ADD CONSTRAINT "IntegrationRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationQuote" ADD CONSTRAINT "IntegrationQuote_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationQuote" ADD CONSTRAINT "IntegrationQuote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationQuote" ADD CONSTRAINT "IntegrationQuote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAction" ADD CONSTRAINT "IntegrationAction_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAction" ADD CONSTRAINT "IntegrationAction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientToWarehouse" ADD CONSTRAINT "_ClientToWarehouse_A_fkey" FOREIGN KEY ("A") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientToWarehouse" ADD CONSTRAINT "_ClientToWarehouse_B_fkey" FOREIGN KEY ("B") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientToImprovement" ADD CONSTRAINT "_ClientToImprovement_A_fkey" FOREIGN KEY ("A") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClientToImprovement" ADD CONSTRAINT "_ClientToImprovement_B_fkey" FOREIGN KEY ("B") REFERENCES "Improvement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

