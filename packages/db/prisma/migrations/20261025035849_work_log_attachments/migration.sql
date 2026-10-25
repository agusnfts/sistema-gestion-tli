-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "improvementCommentId" UUID,
ADD COLUMN     "problemActionId" UUID;

-- CreateTable
CREATE TABLE "ProblemAction" (
    "id" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemAction_problemId_createdAt_idx" ON "ProblemAction"("problemId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_improvementCommentId_idx" ON "Attachment"("improvementCommentId");

-- CreateIndex
CREATE INDEX "Attachment_problemActionId_idx" ON "Attachment"("problemActionId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_improvementCommentId_fkey" FOREIGN KEY ("improvementCommentId") REFERENCES "ImprovementComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_problemActionId_fkey" FOREIGN KEY ("problemActionId") REFERENCES "ProblemAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemAction" ADD CONSTRAINT "ProblemAction_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemAction" ADD CONSTRAINT "ProblemAction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
