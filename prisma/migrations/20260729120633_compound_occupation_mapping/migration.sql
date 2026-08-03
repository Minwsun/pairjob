-- AlterTable
ALTER TABLE "JobLabelMapping" ADD COLUMN     "derivedFrom" JSONB,
ADD COLUMN     "mappingRole" TEXT NOT NULL DEFAULT 'primary';
