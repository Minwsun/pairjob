import type { PrismaClient, Prisma } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function syncCanonicalJob(client: DbClient, jobId: string) {
  const mappings = await client.jobLabelMapping.findMany({ where: { jobId, confirmed: true }, include: { taxonomyLabel: true } });
  const occupation = mappings.find((mapping) => mapping.labelType === "occupation" && mapping.mappingRole === "primary")?.taxonomyLabelId;
  const grouped = new Map<string, typeof mappings>();
  for (const mapping of mappings.filter((item) => item.labelType === "skill" && item.taxonomyLabel)) grouped.set(mapping.taxonomyLabelId!, [...(grouped.get(mapping.taxonomyLabelId!) ?? []), mapping]);
  const requiredSkills = [...grouped.values()].filter((items) => items.some((item) => item.requirementType === "required")).map((items) => ({ id: items[0].taxonomyLabel!.id, label: items[0].taxonomyLabel!.preferredName, level: Math.max(...items.map((item) => item.importance ?? 3)) }));
  const preferredSkills = [...grouped.values()].filter((items) => !items.some((item) => item.requirementType === "required") && items.some((item) => item.requirementType === "preferred")).map((items) => ({ id: items[0].taxonomyLabel!.id, label: items[0].taxonomyLabel!.preferredName }));
  return client.job.update({ where: { id: jobId }, data: { occupation, requiredSkills, preferredSkills } });
}
