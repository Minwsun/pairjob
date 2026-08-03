-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "certificationRequirements" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "JobLabelMapping" ADD COLUMN     "interpretedText" TEXT;
