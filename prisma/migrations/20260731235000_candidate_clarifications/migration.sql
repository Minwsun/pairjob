CREATE TABLE "CandidateClarificationQuestion" (
  "id" TEXT NOT NULL,
  "candidateProfileId" TEXT NOT NULL,
  "profileVersion" INTEGER NOT NULL,
  "field" TEXT NOT NULL,
  "conceptId" TEXT,
  "question" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "impact" INTEGER NOT NULL,
  "informationGain" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "inputType" TEXT NOT NULL,
  "options" JSONB NOT NULL DEFAULT '[]',
  "affectedConcepts" JSONB NOT NULL DEFAULT '[]',
  "status" "ClarificationStatus" NOT NULL DEFAULT 'PENDING',
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateClarificationQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateClarificationAnswer" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "skipped" BOOLEAN NOT NULL DEFAULT false,
  "profileChanges" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateClarificationAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidateClarificationQuestion_candidateProfileId_profileVersion_status_position_idx"
ON "CandidateClarificationQuestion"("candidateProfileId", "profileVersion", "status", "position");
CREATE UNIQUE INDEX "CandidateClarificationAnswer_questionId_key" ON "CandidateClarificationAnswer"("questionId");

ALTER TABLE "CandidateClarificationQuestion" ADD CONSTRAINT "CandidateClarificationQuestion_candidateProfileId_fkey"
FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateClarificationAnswer" ADD CONSTRAINT "CandidateClarificationAnswer_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "CandidateClarificationQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
