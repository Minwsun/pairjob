import { PrismaClient } from "@prisma/client";
import { taxonomyCatalog } from "../lib/taxonomy/catalog";
import { normalizeTaxonomyText } from "../lib/taxonomy/service";

const db = new PrismaClient();

async function main() {
  for (const item of taxonomyCatalog) {
    const semanticFingerprint = `${item.type}:${normalizeTaxonomyText(item.name)}`;
    await db.taxonomyLabel.upsert({ where: { id: item.id }, update: { type: item.type, preferredName: item.name, parentId: item.parentId, semanticFingerprint, definition: `${item.name} trong taxonomy PairJob.`, createdBy: "seed", confidence: 1, reviewStatus: "VERIFIED", status: "ACTIVE" }, create: { id: item.id, type: item.type, preferredName: item.name, parentId: item.parentId, semanticFingerprint, definition: `${item.name} trong taxonomy PairJob.`, createdBy: "seed", confidence: 1, reviewStatus: "VERIFIED", status: "ACTIVE" } });
    for (const alias of [item.name, ...item.aliases]) await db.taxonomyAlias.upsert({ where: { normalized_labelId: { normalized: normalizeTaxonomyText(alias), labelId: item.id } }, update: { alias, kind: alias.length <= 5 ? "abbreviation" : "alias" }, create: { labelId: item.id, alias, normalized: normalizeTaxonomyText(alias), kind: alias.length <= 5 ? "abbreviation" : "alias" } });
  }
  for (const item of taxonomyCatalog.filter((label) => label.parentId)) await db.taxonomyEdge.upsert({ where: { fromId_toId_relation: { fromId: item.id, toId: item.parentId!, relation: "IS_A" } }, update: { confidence: 1, createdBy: "seed" }, create: { fromId: item.id, toId: item.parentId!, relation: "IS_A", confidence: 1, createdBy: "seed" } });
  const relations = [
    ["typescript", "javascript", "RELATED_TO", .9],
    ["react", "typescript", "USED_WITH", .82],
    ["nextjs", "nodejs", "USED_WITH", .72],
    ["react", "redux", "USED_WITH", .88],
    ["docker", "kubernetes", "REQUIRES", .74],
    ["rest_api", "nodejs", "APPLIED_IN", .72],
    ["graphql", "nodejs", "APPLIED_IN", .7],
    ["ui_ux_designer", "design_multimedia", "IS_A", .9],
    ["frontend_web_developer", "digital_product", "RELATED_TO", .78],
    ["backend_developer", "infrastructure_cloud", "RELATED_TO", .68],
    ["devops_engineer", "software_development", "TRANSFERABLE_TO", .76],
    ["cybersecurity_analyst", "infrastructure_cloud", "RELATED_TO", .74],
  ] as const;
  for (const [fromId, toId, relation, confidence] of relations) {
    const exists = await db.taxonomyLabel.count({ where: { id: { in: [fromId, toId] } } });
    if (exists === 2) await db.taxonomyEdge.upsert({ where: { fromId_toId_relation: { fromId, toId, relation } }, update: { confidence, createdBy: "seed" }, create: { fromId, toId, relation, confidence, createdBy: "seed" } });
  }
  console.log(`Seeded ${taxonomyCatalog.length} taxonomy labels.`);
}

main().finally(() => db.$disconnect());
