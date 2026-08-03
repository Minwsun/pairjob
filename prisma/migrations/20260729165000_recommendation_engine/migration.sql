ALTER TABLE "Job" ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE TABLE "RecommendationSession" (
  "id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "kind" TEXT NOT NULL, "queryEntityId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUCCEEDED', "retrievalVersion" TEXT NOT NULL DEFAULT 'hybrid-v1',
  "rankingVersion" TEXT NOT NULL DEFAULT 'llm-semantic-v1', "rerankerVersion" TEXT NOT NULL DEFAULT 'multi-objective-v1',
  "taxonomyVersion" TEXT NOT NULL, "promptVersion" TEXT NOT NULL DEFAULT '2026-07-29', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecommendationSession_actorId_kind_createdAt_idx" ON "RecommendationSession"("actorId", "kind", "createdAt");

CREATE TABLE "RecommendationItem" (
  "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "jobId" TEXT, "candidateProfileId" TEXT,
  "retrievalScore" DOUBLE PRECISION NOT NULL, "matchScore" DOUBLE PRECISION NOT NULL, "recommendationScore" DOUBLE PRECISION NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL, "eligible" BOOLEAN NOT NULL, "rankBefore" INTEGER NOT NULL, "rankAfter" INTEGER NOT NULL,
  "diversityContribution" DOUBLE PRECISION NOT NULL DEFAULT 0, "reasons" JSONB NOT NULL DEFAULT '[]',
  "matchedSignals" JSONB NOT NULL DEFAULT '[]', "taxonomyPaths" JSONB NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecommendationItem_sessionId_rankAfter_idx" ON "RecommendationItem"("sessionId", "rankAfter");
CREATE INDEX "RecommendationItem_jobId_idx" ON "RecommendationItem"("jobId");
CREATE INDEX "RecommendationItem_candidateProfileId_idx" ON "RecommendationItem"("candidateProfileId");

CREATE TABLE "RecommendationEvent" (
  "id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "sessionId" TEXT, "eventType" TEXT NOT NULL,
  "targetJobId" TEXT, "targetCandidateId" TEXT, "position" INTEGER, "strength" DOUBLE PRECISION NOT NULL,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecommendationEvent_actorId_eventType_createdAt_idx" ON "RecommendationEvent"("actorId", "eventType", "createdAt");
CREATE INDEX "RecommendationEvent_sessionId_idx" ON "RecommendationEvent"("sessionId");

CREATE TABLE "RecommendationPreference" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "explicit" JSONB NOT NULL DEFAULT '{}', "inferred" JSONB NOT NULL DEFAULT '{}',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecommendationPreference_userId_key" ON "RecommendationPreference"("userId");

ALTER TABLE "RecommendationSession" ADD CONSTRAINT "RecommendationSession_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecommendationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationItem" ADD CONSTRAINT "RecommendationItem_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecommendationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationPreference" ADD CONSTRAINT "RecommendationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Job" SET "publishedAt" = "createdAt" WHERE "published" = true AND "publishedAt" IS NULL;
