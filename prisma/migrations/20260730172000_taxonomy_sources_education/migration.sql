ALTER TABLE "TaxonomyLabel"
ADD COLUMN "externalSource" TEXT,
ADD COLUMN "externalId" TEXT,
ADD COLUMN "sourceVersion" TEXT,
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN "metadata" JSONB,
ADD COLUMN "activationReason" TEXT;

CREATE UNIQUE INDEX "TaxonomyLabel_externalSource_externalId_key" ON "TaxonomyLabel"("externalSource", "externalId");

ALTER TABLE "Job" ADD COLUMN "educationRequirements" JSONB NOT NULL DEFAULT '[]';
