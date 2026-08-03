ALTER TABLE "Job"
ADD COLUMN "weeklyHoursMin" INTEGER,
ADD COLUMN "weeklyHoursMax" INTEGER,
ADD COLUMN "deadlineAt" TIMESTAMP(3),
ADD COLUMN "projectDurationText" TEXT,
ADD COLUMN "responsibilities" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "deliverables" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "benefits" JSONB NOT NULL DEFAULT '[]';
