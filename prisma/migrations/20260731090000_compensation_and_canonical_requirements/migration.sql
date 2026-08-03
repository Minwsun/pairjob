ALTER TABLE "CandidateProfile"
ADD COLUMN "expectedCompensationMin" DOUBLE PRECISION,
ADD COLUMN "expectedCompensationMax" DOUBLE PRECISION,
ADD COLUMN "compensationCurrency" TEXT NOT NULL DEFAULT 'VND',
ADD COLUMN "compensationPeriod" TEXT NOT NULL DEFAULT 'HOUR',
ADD COLUMN "originalCompensation" DOUBLE PRECISION,
ADD COLUMN "originalCurrency" TEXT,
ADD COLUMN "compensationExchangeRate" DOUBLE PRECISION;

ALTER TABLE "Job"
ADD COLUMN "budgetMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'VND',
ADD COLUMN "compensationPeriod" TEXT NOT NULL DEFAULT 'HOUR',
ADD COLUMN "originalBudgetMin" DOUBLE PRECISION,
ADD COLUMN "originalBudgetMax" DOUBLE PRECISION,
ADD COLUMN "originalCurrency" TEXT,
ADD COLUMN "compensationExchangeRate" DOUBLE PRECISION,
ADD COLUMN "canonicalSummary" TEXT,
ADD COLUMN "canonicalRequirements" JSONB NOT NULL DEFAULT '[]';

UPDATE "CandidateProfile" SET "originalCompensation" = "hourlyRate", "originalCurrency" = 'USD', "compensationExchangeRate" = 26000, "expectedCompensationMin" = "hourlyRate" * 26000, "expectedCompensationMax" = "hourlyRate" * 26000 WHERE "hourlyRate" IS NOT NULL;
UPDATE "Job" SET "originalBudgetMax" = "budgetMax", "originalCurrency" = 'USD', "compensationExchangeRate" = 26000, "budgetMax" = "budgetMax" * 26000;
