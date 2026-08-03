CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "CandidateProfile"
ALTER COLUMN "availabilityHours" DROP NOT NULL,
ALTER COLUMN "availabilityHours" DROP DEFAULT,
ALTER COLUMN "hourlyRate" DROP NOT NULL,
ALTER COLUMN "hourlyRate" DROP DEFAULT,
ADD COLUMN "searchDocument" TEXT NOT NULL DEFAULT '',
ADD COLUMN "embeddingModel" TEXT,
ADD COLUMN "embeddingUpdatedAt" TIMESTAMP(3),
ADD COLUMN "embedding" vector(384),
ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("searchDocument", ''))) STORED;

ALTER TABLE "Job"
ADD COLUMN "searchDocument" TEXT NOT NULL DEFAULT '',
ADD COLUMN "embeddingModel" TEXT,
ADD COLUMN "embeddingUpdatedAt" TIMESTAMP(3),
ADD COLUMN "embedding" vector(384),
ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("searchDocument", ''))) STORED;

CREATE INDEX "CandidateProfile_searchVector_idx" ON "CandidateProfile" USING GIN ("searchVector");
CREATE INDEX "Job_searchVector_idx" ON "Job" USING GIN ("searchVector");
CREATE INDEX "CandidateProfile_embedding_hnsw_idx" ON "CandidateProfile" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "Job_embedding_hnsw_idx" ON "Job" USING hnsw ("embedding" vector_cosine_ops);
