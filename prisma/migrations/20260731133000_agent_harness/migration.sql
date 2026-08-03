CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "skill" TEXT NOT NULL,
    "skillVersion" TEXT NOT NULL,
    "modelRoute" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "budgetClass" TEXT NOT NULL,
    "maxSteps" INTEGER NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "unresolvedRisks" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "toolName" TEXT,
    "arguments" JSONB,
    "result" JSONB,
    "reasoning" TEXT,
    "error" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "provenance" JSONB,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "supersededBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRun_actorId_skill_startedAt_idx" ON "AgentRun"("actorId", "skill", "startedAt");
CREATE INDEX "AgentRun_status_startedAt_idx" ON "AgentRun"("status", "startedAt");
CREATE UNIQUE INDEX "AgentStep_runId_position_key" ON "AgentStep"("runId", "position");
CREATE UNIQUE INDEX "AgentMemory_scope_scopeId_kind_fingerprint_key" ON "AgentMemory"("scope", "scopeId", "kind", "fingerprint");
CREATE INDEX "AgentMemory_scope_scopeId_kind_expiresAt_idx" ON "AgentMemory"("scope", "scopeId", "kind", "expiresAt");
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
