ALTER TABLE "RecomputeTask"
ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "leaseUntil" TIMESTAMP(3),
ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "processedItems" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalItems" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RecommendationSession"
ADD COLUMN "queryVersion" TEXT NOT NULL DEFAULT '1',
ADD COLUMN "cacheKey" TEXT,
ADD COLUMN "resultPayload" JSONB,
ADD COLUMN "staleAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "RecommendationSession_cacheKey_key" ON "RecommendationSession"("cacheKey");
CREATE INDEX "RecommendationSession_kind_queryEntityId_queryVersion_createdAt_idx"
ON "RecommendationSession"("kind", "queryEntityId", "queryVersion", "createdAt");
