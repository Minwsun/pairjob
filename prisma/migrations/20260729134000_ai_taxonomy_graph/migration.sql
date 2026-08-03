ALTER TABLE "TaxonomyLabel"
ADD COLUMN "definition" TEXT,
ADD COLUMN "semanticFingerprint" TEXT,
ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT 'seed',
ADD COLUMN "model" TEXT,
ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'VERIFIED';

CREATE UNIQUE INDEX "TaxonomyLabel_semanticFingerprint_key" ON "TaxonomyLabel"("semanticFingerprint");

CREATE TABLE "TaxonomyEdge" (
  "id" TEXT NOT NULL,
  "fromId" TEXT NOT NULL,
  "toId" TEXT NOT NULL,
  "relation" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "createdBy" TEXT NOT NULL DEFAULT 'seed',
  "evidence" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxonomyEdge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaxonomyEdge_fromId_toId_relation_key" ON "TaxonomyEdge"("fromId", "toId", "relation");
CREATE INDEX "TaxonomyEdge_fromId_relation_idx" ON "TaxonomyEdge"("fromId", "relation");
CREATE INDEX "TaxonomyEdge_toId_relation_idx" ON "TaxonomyEdge"("toId", "relation");

CREATE TABLE "TaxonomyResolution" (
  "id" TEXT NOT NULL,
  "taxonomyLabelId" TEXT,
  "rawText" TEXT NOT NULL,
  "interpretedText" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "evidence" TEXT,
  "model" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxonomyResolution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaxonomyResolution_entityType_rawText_idx" ON "TaxonomyResolution"("entityType", "rawText");

ALTER TABLE "TaxonomyEdge" ADD CONSTRAINT "TaxonomyEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "TaxonomyLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxonomyEdge" ADD CONSTRAINT "TaxonomyEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "TaxonomyLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxonomyResolution" ADD CONSTRAINT "TaxonomyResolution_taxonomyLabelId_fkey" FOREIGN KEY ("taxonomyLabelId") REFERENCES "TaxonomyLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
