CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "documentId" TEXT,
    "flow" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "currentStage" TEXT,
    "errorCode" TEXT,
    "error" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "progress" INTEGER NOT NULL,
    "message" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RankingPolicy" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RankingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PipelineRun_operationId_key" ON "PipelineRun"("operationId");
CREATE INDEX "PipelineRun_actorId_flow_startedAt_idx" ON "PipelineRun"("actorId", "flow", "startedAt");
CREATE INDEX "PipelineRun_status_startedAt_idx" ON "PipelineRun"("status", "startedAt");
CREATE INDEX "PipelineStage_runId_startedAt_idx" ON "PipelineStage"("runId", "startedAt");
CREATE UNIQUE INDEX "RankingPolicy_version_key" ON "RankingPolicy"("version");
CREATE INDEX "RankingPolicy_kind_active_idx" ON "RankingPolicy"("kind", "active");

ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
