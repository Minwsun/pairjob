import { PrismaClient } from "@prisma/client";
import { analyzeTaxonomyPhrase } from "../lib/taxonomy/service";
import { syncCanonicalJob } from "../lib/jobs/sync";

const db = new PrismaClient();

async function main() {
  const mappings = await db.jobLabelMapping.findMany({ where: { labelType: "occupation", OR: [{ confidence: 0 }, { method: "new_label_candidate" }] } });
  let updated = 0;
  for (const mapping of mappings) {
    const resolution = await analyzeTaxonomyPhrase(mapping.rawText, "occupation");
    if (!resolution.primary || resolution.method !== "composition_rule") continue;
    await db.$transaction(async (transaction) => {
      await transaction.jobLabelMapping.update({ where: { id: mapping.id }, data: { taxonomyLabelId: resolution.primary!.label.id, confidence: resolution.primary!.confidence, method: resolution.method, mappingRole: "primary", confirmed: resolution.primary!.confidence >= .95, derivedFrom: resolution.components.map((component) => ({ rawText: component.rawText, labelId: component.candidate.label.id })) } });
      for (const component of resolution.components) {
        const exists = await transaction.jobLabelMapping.findFirst({ where: { jobId: mapping.jobId, labelType: "occupation", taxonomyLabelId: component.candidate.label.id, mappingRole: "component" } });
        if (!exists) await transaction.jobLabelMapping.create({ data: { jobId: mapping.jobId, taxonomyLabelId: component.candidate.label.id, rawText: component.rawText, labelType: "occupation", confidence: component.candidate.confidence, method: component.candidate.method, evidence: mapping.evidence, mappingRole: "component", confirmed: component.candidate.confidence >= .95 } });
      }
      await transaction.clarificationQuestion.updateMany({ where: { jobId: mapping.jobId, field: "occupation", status: "PENDING" }, data: { status: "ANSWERED" } });
      await syncCanonicalJob(transaction, mapping.jobId);
    });
    updated++;
  }
  console.log(`Backfilled ${updated} compound occupation mappings.`);
}

main().finally(() => db.$disconnect());

