ALTER TABLE "TaxonomyEdge"
ADD COLUMN "source" TEXT,
ADD COLUMN "sourceVersion" TEXT,
ADD COLUMN "inferencePolicy" TEXT NOT NULL DEFAULT 'EXPLICIT',
ADD COLUMN "maxHops" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "scoreCap" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "metadata" JSONB;

CREATE TABLE "CandidateConceptAssertion" (
  "id" TEXT NOT NULL,
  "candidateProfileId" TEXT NOT NULL,
  "taxonomyLabelId" TEXT NOT NULL,
  "assertionType" TEXT NOT NULL,
  "proficiency" DOUBLE PRECISION,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "sourceVersion" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateConceptAssertion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateConceptAssertion_candidateProfileId_taxonomyLabelId_assertionType_sourceVersion_key"
ON "CandidateConceptAssertion"("candidateProfileId", "taxonomyLabelId", "assertionType", "sourceVersion");
CREATE INDEX "CandidateConceptAssertion_candidateProfileId_active_idx" ON "CandidateConceptAssertion"("candidateProfileId", "active");
CREATE INDEX "CandidateConceptAssertion_taxonomyLabelId_assertionType_idx" ON "CandidateConceptAssertion"("taxonomyLabelId", "assertionType");

ALTER TABLE "CandidateConceptAssertion" ADD CONSTRAINT "CandidateConceptAssertion_candidateProfileId_fkey"
FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateConceptAssertion" ADD CONSTRAINT "CandidateConceptAssertion_taxonomyLabelId_fkey"
FOREIGN KEY ("taxonomyLabelId") REFERENCES "TaxonomyLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
