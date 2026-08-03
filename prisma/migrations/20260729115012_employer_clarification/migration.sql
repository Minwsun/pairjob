-- CreateEnum
CREATE TYPE "TaxonomyStatus" AS ENUM ('ACTIVE', 'PENDING', 'INACTIVE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'CLARIFYING', 'READY_FOR_REVIEW', 'CONFIRMED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ClarificationStatus" AS ENUM ('PENDING', 'ANSWERED', 'SKIPPED', 'INVALIDATED');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "clarificationDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "experiencePolicy" TEXT,
ADD COLUMN     "status" "JobStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "TaxonomyLabel" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "preferredName" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "status" "TaxonomyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxonomyLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyAlias" (
    "id" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'vi',
    "kind" TEXT NOT NULL DEFAULT 'alias',

    CONSTRAINT "TaxonomyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLabelMapping" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "taxonomyLabelId" TEXT,
    "rawText" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "requirementType" TEXT,
    "importance" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "evidence" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLabelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClarificationQuestion" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "impact" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "inputType" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "dependsOn" JSONB,
    "status" "ClarificationStatus" NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClarificationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClarificationAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClarificationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxonomyLabel_type_status_idx" ON "TaxonomyLabel"("type", "status");

-- CreateIndex
CREATE INDEX "TaxonomyAlias_normalized_idx" ON "TaxonomyAlias"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyAlias_normalized_labelId_key" ON "TaxonomyAlias"("normalized", "labelId");

-- CreateIndex
CREATE INDEX "JobLabelMapping_jobId_labelType_idx" ON "JobLabelMapping"("jobId", "labelType");

-- CreateIndex
CREATE INDEX "ClarificationQuestion_jobId_status_position_idx" ON "ClarificationQuestion"("jobId", "status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ClarificationAnswer_questionId_key" ON "ClarificationAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "TaxonomyLabel" ADD CONSTRAINT "TaxonomyLabel_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaxonomyLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyAlias" ADD CONSTRAINT "TaxonomyAlias_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "TaxonomyLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLabelMapping" ADD CONSTRAINT "JobLabelMapping_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLabelMapping" ADD CONSTRAINT "JobLabelMapping_taxonomyLabelId_fkey" FOREIGN KEY ("taxonomyLabelId") REFERENCES "TaxonomyLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationAnswer" ADD CONSTRAINT "ClarificationAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ClarificationQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
