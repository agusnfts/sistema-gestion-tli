-- CreateEnum
CREATE TYPE "KnowledgeCategory" AS ENUM ('WMS', 'TMS', 'INTEGRATIONS', 'PROCEDURES', 'FREQUENT_ERRORS', 'OTHER');

-- CreateEnum
CREATE TYPE "ArticleTemplate" AS ENUM ('FREE', 'ERROR_SHEET');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'DONE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ChunkSource" AS ENUM ('ARTICLE', 'DOCUMENT', 'INTEGRATION');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "category" "KnowledgeCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "system" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "extractionDetail" TEXT,
ADD COLUMN     "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "pagesWithoutText" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Article" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "category" "KnowledgeCategory" NOT NULL,
    "template" "ArticleTemplate" NOT NULL DEFAULT 'FREE',
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentVersionId" UUID,
    "sourceTicketId" UUID,
    "sourceProblemId" UUID,
    "authorId" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleVersion" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "errorSymptom" TEXT,
    "errorCause" TEXT,
    "errorSolution" TEXT,
    "errorSteps" TEXT,
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentChunk" (
    "id" UUID NOT NULL,
    "sourceType" "ChunkSource" NOT NULL,
    "articleVersionId" UUID,
    "documentVersionId" UUID,
    "integrationId" UUID,
    "pageNumber" INTEGER,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('tli_spanish'::regconfig, "text")) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_number_key" ON "Article"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Article_currentVersionId_key" ON "Article"("currentVersionId");

-- CreateIndex
CREATE INDEX "Article_status_visibility_idx" ON "Article"("status", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleVersion_articleId_version_key" ON "ArticleVersion"("articleId", "version");

-- CreateIndex
CREATE INDEX "ContentChunk_searchVector_idx" ON "ContentChunk" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "ContentChunk_articleVersionId_idx" ON "ContentChunk"("articleVersionId");

-- CreateIndex
CREATE INDEX "ContentChunk_documentVersionId_idx" ON "ContentChunk"("documentVersionId");

-- CreateIndex
CREATE INDEX "ContentChunk_integrationId_idx" ON "ContentChunk"("integrationId");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ArticleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceTicketId_fkey" FOREIGN KEY ("sourceTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceProblemId_fkey" FOREIGN KEY ("sourceProblemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleVersion" ADD CONSTRAINT "ArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleVersion" ADD CONSTRAINT "ArticleVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_articleVersionId_fkey" FOREIGN KEY ("articleVersionId") REFERENCES "ArticleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentChunk" ADD CONSTRAINT "ContentChunk_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

