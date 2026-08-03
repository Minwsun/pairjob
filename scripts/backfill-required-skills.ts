import { PrismaClient } from "@prisma/client";
import { normalizeTaxonomyText } from "../lib/taxonomy/service";
import { syncCanonicalJob } from "../lib/jobs/sync";

const db = new PrismaClient();

async function main() {
  const jobs = await db.job.findMany({ include: { labelMappings: true } });
  let reviewed = 0;
  for (const job of jobs) {
    await db.$transaction(async (transaction) => {
      for (const mapping of job.labelMappings.filter((item) => item.labelType === "skill")) {
        const normalized = normalizeTaxonomyText(mapping.rawText);
        if (/^(bang|chung chi) (ta|tieng anh)|^ta$/.test(normalized)) {
          await transaction.jobLabelMapping.delete({ where: { id: mapping.id } });
          continue;
        }
        if (mapping.requirementType === "unknown" || !mapping.requirementType) await transaction.jobLabelMapping.update({ where: { id: mapping.id }, data: { requirementType: "uncertain", requirementConfidence: mapping.requirementConfidence ?? .5, requirementReason: mapping.requirementReason ?? "Dữ liệu cũ chưa xác định required/preferred." } });
        else if (mapping.requirementConfidence === null) await transaction.jobLabelMapping.update({ where: { id: mapping.id }, data: { requirementConfidence: mapping.confirmed ? 1 : .7, requirementReason: mapping.requirementReason ?? "Backfill từ mapping hiện có." } });
      }
      await syncCanonicalJob(transaction, job.id);
      const unresolved = await transaction.jobLabelMapping.count({ where: { jobId: job.id, labelType: "skill", OR: [{ requirementType: { in: ["unknown", "uncertain"] } }, { requirementType: null }] } });
      await transaction.job.update({ where: { id: job.id }, data: { skillRequirementPolicy: unresolved ? "NEEDS_CLARIFICATION" : "AI_CONFIRMED", needsReview: job.published && unresolved > 0 } });
      if (unresolved) reviewed++;
    });
  }
  console.log(`Backfilled ${jobs.length} jobs; ${reviewed} need skill clarification.`);
}

main().finally(() => db.$disconnect());
