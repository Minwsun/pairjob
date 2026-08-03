-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYER', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PARSED', 'OCR_REQUIRED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayTitle" TEXT,
    "occupation" TEXT,
    "skills" JSONB NOT NULL DEFAULT '[]',
    "domains" JSONB NOT NULL DEFAULT '[]',
    "experiences" JSONB NOT NULL DEFAULT '[]',
    "projects" JSONB NOT NULL DEFAULT '[]',
    "education" JSONB NOT NULL DEFAULT '[]',
    "experienceYears" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workModes" JSONB NOT NULL DEFAULT '[]',
    "availabilityHours" INTEGER NOT NULL DEFAULT 0,
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceQuality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "displayTitle" TEXT,
    "company" TEXT,
    "occupation" TEXT,
    "requiredSkills" JSONB NOT NULL DEFAULT '[]',
    "preferredSkills" JSONB NOT NULL DEFAULT '[]',
    "domains" JSONB NOT NULL DEFAULT '[]',
    "experienceMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workMode" TEXT,
    "availabilityMin" INTEGER NOT NULL DEFAULT 0,
    "budgetMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extraction" JSONB,
    "missingFields" JSONB NOT NULL DEFAULT '[]',
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "storagePath" TEXT,
    "sourceUrl" TEXT,
    "rawText" TEXT,
    "sections" JSONB,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateProfileId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "breakdown" JSONB NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");

-- CreateIndex
CREATE INDEX "Evidence_entityType_entityId_idx" ON "Evidence"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_jobId_candidateProfileId_key" ON "MatchResult"("jobId", "candidateProfileId");

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
