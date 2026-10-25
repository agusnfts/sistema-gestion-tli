-- CreateEnum
CREATE TYPE "ImprovementStatus" AS ENUM ('IDEA', 'ANALYSIS', 'APPROVED', 'IN_DEVELOPMENT', 'TESTING', 'IMPLEMENTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ImprovementSystem" AS ENUM ('WMS', 'TMS', 'TYT', 'ROUTING', 'OTHER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ARS', 'USD');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "improvementId" UUID;

-- CreateTable
CREATE TABLE "Improvement" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "system" "ImprovementSystem" NOT NULL,
    "requestingAreaId" UUID,
    "currentSituation" TEXT NOT NULL,
    "proposal" TEXT NOT NULL,
    "expectedImpact" TEXT,
    "impact" INTEGER NOT NULL DEFAULT 2,
    "effort" INTEGER NOT NULL DEFAULT 2,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "priorityIsManual" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" UUID,
    "providerId" UUID,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "estimatedCost" DECIMAL(14,2),
    "actualCost" DECIMAL(14,2),
    "estimatedHours" DECIMAL(8,1),
    "actualHours" DECIMAL(8,1),
    "startDate" DATE,
    "targetDate" DATE,
    "completedAt" TIMESTAMP(3),
    "status" "ImprovementStatus" NOT NULL DEFAULT 'IDEA',
    "closingMessage" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Improvement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementComment" (
    "id" UUID NOT NULL,
    "improvementId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImprovementComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ImprovementToProblem" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ImprovementToProblem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Improvement_number_key" ON "Improvement"("number");

-- CreateIndex
CREATE INDEX "Improvement_status_idx" ON "Improvement"("status");

-- CreateIndex
CREATE INDEX "Improvement_system_status_idx" ON "Improvement"("system", "status");

-- CreateIndex
CREATE INDEX "ImprovementComment_improvementId_createdAt_idx" ON "ImprovementComment"("improvementId", "createdAt");

-- CreateIndex
CREATE INDEX "_ImprovementToProblem_B_index" ON "_ImprovementToProblem"("B");

-- CreateIndex
CREATE INDEX "Ticket_improvementId_idx" ON "Ticket"("improvementId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_improvementId_fkey" FOREIGN KEY ("improvementId") REFERENCES "Improvement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Improvement" ADD CONSTRAINT "Improvement_requestingAreaId_fkey" FOREIGN KEY ("requestingAreaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Improvement" ADD CONSTRAINT "Improvement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Improvement" ADD CONSTRAINT "Improvement_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Improvement" ADD CONSTRAINT "Improvement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementComment" ADD CONSTRAINT "ImprovementComment_improvementId_fkey" FOREIGN KEY ("improvementId") REFERENCES "Improvement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementComment" ADD CONSTRAINT "ImprovementComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ImprovementToProblem" ADD CONSTRAINT "_ImprovementToProblem_A_fkey" FOREIGN KEY ("A") REFERENCES "Improvement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ImprovementToProblem" ADD CONSTRAINT "_ImprovementToProblem_B_fkey" FOREIGN KEY ("B") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
