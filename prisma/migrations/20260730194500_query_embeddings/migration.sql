ALTER TABLE "CandidateProfile" ADD COLUMN "queryEmbedding" vector(384);
ALTER TABLE "Job" ADD COLUMN "queryEmbedding" vector(384);
CREATE INDEX "CandidateProfile_queryEmbedding_hnsw_idx" ON "CandidateProfile" USING hnsw ("queryEmbedding" vector_cosine_ops);
CREATE INDEX "Job_queryEmbedding_hnsw_idx" ON "Job" USING hnsw ("queryEmbedding" vector_cosine_ops);
