-- CreateEnum
CREATE TYPE "BusinessSystem" AS ENUM ('WMS', 'TMS', 'TYT', 'ROUTING');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnnouncementImpact" AS ENUM ('NONE', 'DEGRADED', 'OUTAGE');

-- CreateEnum
CREATE TYPE "AnnouncementSendKind" AS ENUM ('NOTICE', 'REMINDER', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "SystemInfo" (
    "key" "BusinessSystem" NOT NULL,
    "providerId" UUID,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemInfo_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DistributionList" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "emails" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpdateAnnouncement" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "systems" "BusinessSystem"[],
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "impact" "AnnouncementImpact" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "reminderHours" INTEGER,
    "createdById" UUID NOT NULL,
    "sentAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closingNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpdateAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementSend" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "kind" "AnnouncementSendKind" NOT NULL,
    "emailCount" INTEGER NOT NULL,
    "userCount" INTEGER NOT NULL,
    "emailed" BOOLEAN NOT NULL,
    "sentById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AreaToUpdateAnnouncement" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_AreaToUpdateAnnouncement_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DistributionListToUpdateAnnouncement" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_DistributionListToUpdateAnnouncement_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_UpdateAnnouncementToWarehouse" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_UpdateAnnouncementToWarehouse_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "DistributionList_name_key" ON "DistributionList"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UpdateAnnouncement_number_key" ON "UpdateAnnouncement"("number");

-- CreateIndex
CREATE INDEX "UpdateAnnouncement_status_startsAt_idx" ON "UpdateAnnouncement"("status", "startsAt");

-- CreateIndex
CREATE INDEX "_AreaToUpdateAnnouncement_B_index" ON "_AreaToUpdateAnnouncement"("B");

-- CreateIndex
CREATE INDEX "_DistributionListToUpdateAnnouncement_B_index" ON "_DistributionListToUpdateAnnouncement"("B");

-- CreateIndex
CREATE INDEX "_UpdateAnnouncementToWarehouse_B_index" ON "_UpdateAnnouncementToWarehouse"("B");

-- AddForeignKey
ALTER TABLE "SystemInfo" ADD CONSTRAINT "SystemInfo_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateAnnouncement" ADD CONSTRAINT "UpdateAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementSend" ADD CONSTRAINT "AnnouncementSend_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "UpdateAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaToUpdateAnnouncement" ADD CONSTRAINT "_AreaToUpdateAnnouncement_A_fkey" FOREIGN KEY ("A") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaToUpdateAnnouncement" ADD CONSTRAINT "_AreaToUpdateAnnouncement_B_fkey" FOREIGN KEY ("B") REFERENCES "UpdateAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DistributionListToUpdateAnnouncement" ADD CONSTRAINT "_DistributionListToUpdateAnnouncement_A_fkey" FOREIGN KEY ("A") REFERENCES "DistributionList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DistributionListToUpdateAnnouncement" ADD CONSTRAINT "_DistributionListToUpdateAnnouncement_B_fkey" FOREIGN KEY ("B") REFERENCES "UpdateAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UpdateAnnouncementToWarehouse" ADD CONSTRAINT "_UpdateAnnouncementToWarehouse_A_fkey" FOREIGN KEY ("A") REFERENCES "UpdateAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UpdateAnnouncementToWarehouse" ADD CONSTRAINT "_UpdateAnnouncementToWarehouse_B_fkey" FOREIGN KEY ("B") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
