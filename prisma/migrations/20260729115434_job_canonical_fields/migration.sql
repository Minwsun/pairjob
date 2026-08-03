-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "contractType" TEXT,
ADD COLUMN     "deadlineText" TEXT,
ADD COLUMN     "languageRequirements" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "locationText" TEXT;
