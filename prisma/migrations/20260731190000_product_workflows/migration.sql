ALTER TABLE "CandidateProfile"
ADD COLUMN "profileVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "lastRecomputedVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "selectedTargetOccupationId" TEXT;

CREATE TABLE "ProfileRevision" (
  "id" TEXT NOT NULL,
  "candidateProfileId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecomputeTask" (
  "id" TEXT NOT NULL,
  "candidateProfileId" TEXT NOT NULL,
  "profileVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecomputeTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoadmapVersion" (
  "id" TEXT NOT NULL,
  "candidateProfileId" TEXT NOT NULL,
  "profileVersion" INTEGER NOT NULL,
  "targetOccupationId" TEXT NOT NULL,
  "taxonomyVersion" TEXT NOT NULL,
  "rankingPolicyVersion" TEXT NOT NULL,
  "roadmap" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoadmapVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Application" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "candidateProfileId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "coverNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationEvent" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfileRevision_candidateProfileId_version_key" ON "ProfileRevision"("candidateProfileId", "version");
CREATE INDEX "ProfileRevision_candidateProfileId_createdAt_idx" ON "ProfileRevision"("candidateProfileId", "createdAt");
CREATE UNIQUE INDEX "RecomputeTask_candidateProfileId_profileVersion_key" ON "RecomputeTask"("candidateProfileId", "profileVersion");
CREATE INDEX "RecomputeTask_status_createdAt_idx" ON "RecomputeTask"("status", "createdAt");
CREATE INDEX "RoadmapVersion_candidateProfileId_profileVersion_targetOccupationId_idx" ON "RoadmapVersion"("candidateProfileId", "profileVersion", "targetOccupationId");
CREATE UNIQUE INDEX "Application_jobId_candidateProfileId_key" ON "Application"("jobId", "candidateProfileId");
CREATE INDEX "Application_candidateProfileId_status_createdAt_idx" ON "Application"("candidateProfileId", "status", "createdAt");
CREATE INDEX "Application_jobId_status_createdAt_idx" ON "Application"("jobId", "status", "createdAt");
CREATE INDEX "ApplicationEvent_applicationId_createdAt_idx" ON "ApplicationEvent"("applicationId", "createdAt");

ALTER TABLE "ProfileRevision" ADD CONSTRAINT "ProfileRevision_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecomputeTask" ADD CONSTRAINT "RecomputeTask_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapVersion" ADD CONSTRAINT "RoadmapVersion_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
