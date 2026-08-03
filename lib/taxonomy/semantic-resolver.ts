import { db } from "@/lib/db";
import { generateStructured, modelFor } from "@/lib/ai/client";
import { resolveTaxonomyWithAgent } from "@/lib/ai/taxonomy-agent";
import { taxonomyResolutionSchema } from "@/lib/ai/schemas";
import { systemPrompts } from "@/lib/prompts";
import { findTaxonomyCandidates, normalizeTaxonomyText } from "@/lib/taxonomy/service";
import { isValidHierarchyParent } from "@/lib/taxonomy/validator";
import { z } from "zod";

type ResolveInput = { rawText: string; interpretedText?: string; type: string; evidence?: string };
type ResolveOutput = Awaited<ReturnType<typeof resolveTaxonomyConcept>>;

const batchSelectionSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return { resolutions: value };
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (!record.resolutions && Array.isArray(record.results)) return { resolutions: record.results };
    if (!record.resolutions && Array.isArray(record.items)) return { resolutions: record.items };
  }
  return value;
}, z.object({ resolutions: z.array(z.preprocess((value) => {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return { key: record.key ?? record.concept_key ?? "", selected_id: record.selected_id ?? record.label_id ?? null, confidence: record.confidence ?? record.similarity ?? .5, reason: record.reason ?? record.rationale ?? "Batch semantic selection." };
}, z.object({ key: z.string().default(""), selected_id: z.string().nullable(), confidence: z.number().min(0).max(1), reason: z.string() }))) }));

export const taxonomyDefaultParents: Record<string, string> = { occupation: "occupations", skill: "generic_skills", tool: "generic_skills", knowledge: "onet_skills", domain: "business_domains", language: "languages", certification: "certifications", degree_level: "education_levels", field_of_study: "fields_of_study" };
const taxonomyDefaultParentDefinitions: Record<string, { type: string; preferredName: string }> = {
  occupations: { type: "field", preferredName: "Occupations" },
  generic_skills: { type: "skill_group", preferredName: "Skills" },
  onet_skills: { type: "skill_group", preferredName: "O*NET Skills" },
  business_domains: { type: "domain_group", preferredName: "Business Domains" },
  languages: { type: "language_group", preferredName: "Languages" },
  certifications: { type: "certification_group", preferredName: "Certifications" },
  education_levels: { type: "degree_group", preferredName: "Education Levels" },
  fields_of_study: { type: "field_of_study_group", preferredName: "Fields of Study" },
};
const taxonomyParentTypes: Record<string, string[]> = { occupation: ["root", "field", "specialization", "occupation"], skill: ["root", "skill_group", "skill"], tool: ["root", "skill_group", "tool"], knowledge: ["root", "skill_group", "knowledge"], domain: ["root", "domain_group", "domain"], language: ["language_group", "language"], certification: ["certification_group", "certification"], degree_level: ["root", "degree_group", "degree_level"], field_of_study: ["root", "field_of_study_group", "field_of_study"] };

async function ensureDefaultParent(entityType: string) {
  const id = taxonomyDefaultParents[entityType];
  const definition = id ? taxonomyDefaultParentDefinitions[id] : null;
  if (!id || !definition) throw new Error(`TAXONOMY_ENTITY_TYPE_UNSUPPORTED:${entityType}`);
  return db.taxonomyLabel.upsert({
    where: { id },
    update: { status: "ACTIVE" },
    create: { id, type: definition.type, preferredName: definition.preferredName, definition: `Canonical parent for ${entityType} concepts.`, semanticFingerprint: fingerprint(definition.type, definition.preferredName), createdBy: "system", confidence: 1, reviewStatus: "AUTO_APPROVED", status: "ACTIVE", activationReason: "Required canonical taxonomy parent" },
  });
}

async function ensureFallbackParent(entityType: string, requestedId?: string | null) {
  if (requestedId) {
    const existing = await db.taxonomyLabel.findUnique({ where: { id: requestedId } });
    if (existing && isValidHierarchyParent(entityType, existing.type)) return existing;
  }
  return ensureDefaultParent(entityType);
}

async function createBroadConcept(input: ResolveInput, confidence = .8, method = "batch_created") {
  const interpretedText = input.interpretedText?.trim() || input.rawText.trim();
  const parent = await ensureFallbackParent(input.type);
  const semanticFingerprint = fingerprint(input.type, interpretedText);
  const duplicate = await db.taxonomyLabel.findFirst({ where: { OR: [{ semanticFingerprint }, { type: input.type, preferredName: { equals: interpretedText, mode: "insensitive" } }] } });
  if (duplicate) return { label: duplicate, confidence, method: `${method}_existing`, action: "USE_EXISTING" as const };
  const baseId = normalizeTaxonomyText(interpretedText).replace(/ /g, "_") || "label";
  const label = await db.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", semanticFingerprint);
    const existing = await transaction.taxonomyLabel.findFirst({ where: { OR: [{ semanticFingerprint }, { type: input.type, preferredName: { equals: interpretedText, mode: "insensitive" } }] } });
    if (existing) return existing;
    const id = await transaction.taxonomyLabel.findUnique({ where: { id: baseId } }) ? `${input.type}_${baseId}_${crypto.randomUUID().slice(0, 6)}` : baseId;
    const created = await transaction.taxonomyLabel.create({ data: { id, type: input.type, preferredName: interpretedText, definition: `Khái niệm được ghi nhận từ dữ liệu người dùng: ${interpretedText}.`, parentId: parent.id, semanticFingerprint, createdBy: method, model: modelFor("fast"), confidence, reviewStatus: "AUTO_APPROVED", status: "ACTIVE", activationReason: "Batch resolver found no equivalent label; attached to canonical broad parent" } });
    await transaction.taxonomyAlias.createMany({ data: [...new Set([input.rawText, interpretedText])].map((alias) => ({ labelId: id, alias, normalized: normalizeTaxonomyText(alias), kind: "batch_alias" })), skipDuplicates: true });
    await transaction.taxonomyEdge.create({ data: { fromId: id, toId: parent.id, relation: "BROADER", confidence, createdBy: method, evidence: input.evidence } });
    await transaction.taxonomyResolution.create({ data: { taxonomyLabelId: id, rawText: input.rawText, interpretedText, entityType: input.type, action: "CREATE_CHILD", confidence, evidence: input.evidence, model: modelFor("fast"), metadata: { method, deferredHierarchyEnrichment: true } } });
    return created;
  });
  return { label, confidence, method, action: "CREATE_CHILD" as const };
}

function fingerprint(type: string, value: string) {
  return `${type}:${normalizeTaxonomyText(value)}`;
}

export async function resolveTaxonomyConcept(input: ResolveInput) {
  const interpretedText = input.interpretedText?.trim() || input.rawText.trim();
  const lexical = await findTaxonomyCandidates(interpretedText, input.type, 10);
  if (lexical[0]?.confidence >= .9) {
    await db.taxonomyResolution.create({ data: { taxonomyLabelId: lexical[0].label.id, rawText: input.rawText, interpretedText, entityType: input.type, action: "USE_EXISTING", confidence: 1, evidence: input.evidence, model: modelFor(), metadata: { method: lexical[0].method } } });
    return { label: lexical[0].label, confidence: 1, method: lexical[0].method, action: "USE_EXISTING" as const };
  }

  await ensureDefaultParent(input.type);

  const [candidateLabels, defaultParentLabels] = await Promise.all([db.taxonomyLabel.findMany({
    where: { status: "ACTIVE", OR: [{ type: input.type }, { type: { in: ["root", "field", "specialization", "skill_group", "domain_group", "language_group", "certification_group", "degree_group", "field_of_study_group"] } }] },
    include: { aliases: true, outgoingEdges: true, incomingEdges: true },
    take: 250,
  }), db.taxonomyLabel.findMany({ where: { id: { in: [...new Set(Object.values(taxonomyDefaultParents))] }, status: "ACTIVE" }, include: { aliases: true, outgoingEdges: true, incomingEdges: true } })]);
  const labels = [...new Map([...defaultParentLabels, ...candidateLabels].map((label) => [label.id, label])).values()];
  const resolverInput = {
    concept: { raw_text: input.rawText, interpreted_text: interpretedText, entity_type: input.type, evidence: input.evidence },
    existing_candidates: labels.filter((label) => label.type === input.type).map((label) => ({ id: label.id, name: label.preferredName, type: label.type, definition: label.definition ?? label.description, aliases: label.aliases.map((alias) => alias.alias) })),
    parent_candidates: labels.filter((label) => label.type !== input.type).map((label) => ({ id: label.id, name: label.preferredName, type: label.type, definition: label.definition ?? label.description, parent_id: label.parentId })),
    graph_edges: labels.flatMap((label) => [...label.outgoingEdges.map((edge) => ({ from: label.id, relation: edge.relation, to: edge.toId })), ...label.incomingEdges.map((edge) => ({ from: edge.fromId, relation: edge.relation, to: label.id }))]),
    lexical_candidates: lexical.map((item) => ({ id: item.label.id, name: item.label.preferredName, type: item.label.type, confidence: item.confidence })),
  };
  const hierarchyPrompt = `${systemPrompts.taxonomyResolver}\nNếu parent hiện có quá rộng, trả proposed_path tối đa 3 node trung gian theo thứ tự rộng đến hẹp. Chỉ đề xuất node chưa có khái niệm tương đương; mỗi node phải là parent ngữ nghĩa thật sự của node sau. Không cần node trung gian thì trả mảng rỗng.`;
  let result;
  try {
    result = (await resolveTaxonomyWithAgent(resolverInput, hierarchyPrompt)).output;
  } catch (error) {
    if (lexical[0]?.label.type === input.type && lexical[0].confidence >= .82) return { label: lexical[0].label, confidence: lexical[0].confidence, method: "lexical_fallback", action: "USE_EXISTING" as const };
    const parentId = taxonomyDefaultParents[input.type];
    if (!parentId || !labels.some((label) => label.id === parentId)) throw error;
    const semanticFingerprint = fingerprint(input.type, interpretedText);
    const duplicate = await db.taxonomyLabel.findFirst({ where: { OR: [{ semanticFingerprint }, { type: input.type, preferredName: { equals: interpretedText, mode: "insensitive" } }] } });
    if (duplicate) return { label: duplicate, confidence: .65, method: "pending_fallback_existing", action: "USE_EXISTING" as const };
    const baseId = normalizeTaxonomyText(interpretedText).replace(/ /g, "_") || "label";
    const id = await db.taxonomyLabel.findUnique({ where: { id: baseId } }) ? `${baseId}_${crypto.randomUUID().slice(0, 6)}` : baseId;
    const label = await db.$transaction(async (transaction) => {
      const created = await transaction.taxonomyLabel.create({ data: { id, type: input.type, preferredName: interpretedText, definition: `Khái niệm được ghi nhận từ dữ liệu người dùng: ${interpretedText}.`, parentId, semanticFingerprint, createdBy: "resolver_fallback", model: modelFor(), confidence: .8, reviewStatus: "AUTO_APPROVED", status: "ACTIVE", activationReason: "Fallback passed duplicate and parent gates" } });
      await transaction.taxonomyAlias.createMany({ data: [...new Set([input.rawText, interpretedText])].map((alias) => ({ labelId: id, alias, normalized: normalizeTaxonomyText(alias), kind: "pending_alias" })), skipDuplicates: true });
      await transaction.taxonomyEdge.create({ data: { fromId: id, toId: parentId, relation: "IS_A", confidence: .8, createdBy: "resolver_fallback", evidence: input.evidence } });
      await transaction.taxonomyResolution.create({ data: { taxonomyLabelId: id, rawText: input.rawText, interpretedText, entityType: input.type, action: "CREATE_CHILD", confidence: .8, evidence: input.evidence, model: modelFor(), metadata: { method: "auto_fallback", error: error instanceof Error ? error.message : String(error) } } });
      return created;
    });
    return { label, confidence: .8, method: "auto_fallback_created", action: "CREATE_CHILD" as const };
  }

  const byId = new Map(labels.map((label) => [label.id, label]));
  const validParents = (ids: string[]) => ids.map((id) => byId.get(id)).filter((parent) => parent && (taxonomyParentTypes[input.type] ?? ["root"]).includes(parent.type));
  if (result.action === "USE_EXISTING" && (!result.selected_id || byId.get(result.selected_id)?.type !== input.type)) result = await generateStructured(`${systemPrompts.taxonomyResolver}\nLần trước selected_id sai entity_type. USE_EXISTING chỉ được chọn ID trong existing_candidates; nếu không có label đồng nghĩa, bắt buộc CREATE_CHILD/CREATE_RELATED với parent hợp lệ.`, { ...resolverInput, invalid_previous_result: result }, taxonomyResolutionSchema);
  const sameConcept = result.candidate_comparisons.filter((item) => item.same_concept && item.similarity >= .82).sort((left, right) => right.similarity - left.similarity)[0];
  if (result.action !== "USE_EXISTING" && sameConcept && byId.get(sameConcept.label_id)?.type === input.type) result = { ...result, action: "USE_EXISTING", selected_id: sameConcept.label_id, confidence: Math.max(result.confidence, sameConcept.similarity) };
  if (result.action !== "USE_EXISTING" && lexical[0]?.label.type === input.type && lexical[0].confidence >= .88) result = { ...result, action: "USE_EXISTING", selected_id: lexical[0].label.id, confidence: lexical[0].confidence };
  if (result.action !== "USE_EXISTING" && (result.confidence < .8 || validParents(result.parent_ids).length !== result.parent_ids.length || !result.parent_ids.length)) result = await generateStructured(`${systemPrompts.taxonomyResolver}\nKết quả trước bị semantic gate từ chối. Chọn parent_id tồn tại, đúng lớp ${input.type}; chỉ tạo khi confidence >= 0.8 và không candidate nào same_concept >= 0.82.`, { ...resolverInput, rejected_previous_result: result }, taxonomyResolutionSchema);
  if (result.action === "USE_EXISTING" && (!result.selected_id || byId.get(result.selected_id)?.type !== input.type)) {
    if (lexical[0]?.label.type === input.type && lexical[0].confidence >= .45) result = { ...result, selected_id: lexical[0].label.id, confidence: lexical[0].confidence };
    else result = { ...result, action: "CREATE_CHILD", selected_id: null, parent_ids: [taxonomyDefaultParents[input.type]].filter(Boolean), confidence: Math.max(.65, result.confidence) };
  }
  if (result.action === "USE_EXISTING") {
    const selected = result.selected_id ? byId.get(result.selected_id) : null;
    if (!selected || selected.type !== input.type) throw new Error("TAXONOMY_INVALID_EXISTING_SELECTION");
    const aliases = [...new Set([input.rawText, interpretedText, ...result.aliases])];
    for (const alias of aliases) await db.taxonomyAlias.upsert({ where: { normalized_labelId: { normalized: normalizeTaxonomyText(alias), labelId: selected.id } }, update: { alias }, create: { labelId: selected.id, alias, normalized: normalizeTaxonomyText(alias), kind: "ai_alias" } });
    await db.taxonomyResolution.create({ data: { taxonomyLabelId: selected.id, rawText: input.rawText, interpretedText, entityType: input.type, action: result.action, confidence: result.confidence, evidence: input.evidence, model: modelFor(), metadata: result } });
    return { label: selected, confidence: result.confidence, method: "semantic_existing", action: result.action };
  }

  let parents = validParents(result.parent_ids);
  if (result.confidence < .8 || !parents.length || parents.length !== result.parent_ids.length) {
    const fallbackParentId = taxonomyDefaultParents[input.type];
    if (!fallbackParentId) throw new Error(`TAXONOMY_ENTITY_TYPE_UNSUPPORTED:${input.type}`);
    const fallbackParent = byId.get(fallbackParentId) ?? await db.taxonomyLabel.findFirst({ where: { id: fallbackParentId, status: "ACTIVE" }, include: { aliases: true, outgoingEdges: true, incomingEdges: true } });
    if (!fallbackParent) throw new Error(`TAXONOMY_DEFAULT_PARENT_MISSING:${input.type}:${fallbackParentId}`);
    parents = [fallbackParent];
    result = { ...result, parent_ids: [fallbackParent.id], confidence: Math.max(.8, result.confidence), rationale: `${result.rationale} Auto-attached to broad parent after semantic adjudication.` };
  }
  const semanticFingerprint = fingerprint(input.type, result.preferred_name);
  const duplicate = await db.taxonomyLabel.findFirst({ where: { OR: [{ semanticFingerprint }, { type: input.type, preferredName: { equals: result.preferred_name, mode: "insensitive" } }] } });
  if (duplicate) return resolveTaxonomyConcept({ ...input, interpretedText: duplicate.preferredName });

  const baseId = normalizeTaxonomyText(result.preferred_name).replace(/ /g, "_") || "label";
  const id = await db.taxonomyLabel.findUnique({ where: { id: baseId } }) ? `${input.type}_${baseId}` : baseId;
  const related = result.related.filter((edge) => byId.has(edge.label_id));
  const label = await db.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", semanticFingerprint);
    const existing = await transaction.taxonomyLabel.findFirst({ where: { OR: [{ semanticFingerprint }, { type: input.type, preferredName: { equals: result.preferred_name, mode: "insensitive" } }] } });
    if (existing) return existing;
    let primaryParentId = parents[0]!.id;
    for (const node of result.proposed_path) {
      const currentParent = await transaction.taxonomyLabel.findUnique({ where: { id: primaryParentId }, select: { type: true } });
      if (!currentParent || !isValidHierarchyParent(node.type, currentParent.type)) continue;
      const nodeFingerprint = fingerprint(node.type, node.preferred_name);
      const duplicateNode = await transaction.taxonomyLabel.findFirst({ where: { OR: [{ semanticFingerprint: nodeFingerprint }, { type: node.type, preferredName: { equals: node.preferred_name, mode: "insensitive" } }] } });
      if (duplicateNode) { primaryParentId = duplicateNode.id; continue; }
      const nodeBaseId = normalizeTaxonomyText(node.preferred_name).replace(/ /g, "_") || "branch";
      const nodeId = await transaction.taxonomyLabel.findUnique({ where: { id: nodeBaseId } }) ? `${node.type}_${nodeBaseId}` : nodeBaseId;
      await transaction.taxonomyLabel.create({ data: { id: nodeId, type: node.type, preferredName: node.preferred_name, definition: node.definition, parentId: primaryParentId, semanticFingerprint: nodeFingerprint, createdBy: "ai", model: modelFor(), confidence: result.confidence, reviewStatus: "AUTO_APPROVED", status: "ACTIVE", activationReason: "AI intermediate hierarchy node passed duplicate and parent gates" } });
      await transaction.taxonomyEdge.create({ data: { fromId: nodeId, toId: primaryParentId, relation: "BROADER", confidence: result.confidence, createdBy: "ai", evidence: input.evidence } });
      primaryParentId = nodeId;
    }
    const finalParent = await transaction.taxonomyLabel.findUnique({ where: { id: primaryParentId }, select: { type: true } });
    if (!finalParent || !isValidHierarchyParent(input.type, finalParent.type)) primaryParentId = parents[0]!.id;
    const created = await transaction.taxonomyLabel.create({ data: { id, type: input.type, preferredName: result.preferred_name, definition: result.definition, description: result.rationale, parentId: primaryParentId, semanticFingerprint, createdBy: "ai", model: modelFor(), confidence: result.confidence, reviewStatus: "AUTO_APPROVED", status: "ACTIVE", activationReason: result.auto_approval_reason } });
    await transaction.taxonomyAlias.createMany({ data: [...new Set([result.preferred_name, input.rawText, interpretedText, ...result.aliases])].map((alias) => ({ labelId: id, alias, normalized: normalizeTaxonomyText(alias), kind: "ai_alias" })), skipDuplicates: true });
    await transaction.taxonomyEdge.createMany({ data: [{ fromId: id, toId: primaryParentId, relation: "BROADER", confidence: result.confidence, createdBy: "ai", evidence: input.evidence }, ...parents.slice(1).map((parent) => ({ fromId: id, toId: parent!.id, relation: "BROADER", confidence: result.confidence, createdBy: "ai", evidence: input.evidence }))], skipDuplicates: true });
    if (related.length) await transaction.taxonomyEdge.createMany({ data: related.map((edge) => ({ fromId: id, toId: edge.label_id, relation: edge.relation, confidence: edge.confidence, createdBy: "ai", evidence: input.evidence })), skipDuplicates: true });
    await transaction.taxonomyResolution.create({ data: { taxonomyLabelId: id, rawText: input.rawText, interpretedText, entityType: input.type, action: result.action, confidence: result.confidence, evidence: input.evidence, model: modelFor(), metadata: result } });
    return created;
  });
  return { label, confidence: result.confidence, method: "semantic_created", action: result.action };
}

export async function resolveTaxonomyConcepts(inputs: ResolveInput[]): Promise<ResolveOutput[]> {
  const unique = new Map<string, ResolveInput>();
  for (const input of inputs) unique.set(`${input.type}:${normalizeTaxonomyText(input.interpretedText?.trim() || input.rawText)}`, input);
  const entries = [...unique.entries()];
  const candidates = await Promise.all(entries.map(async ([key, input]) => ({ key, input, candidates: await findTaxonomyCandidates(input.interpretedText?.trim() || input.rawText, input.type, 8) })));
  const resolved = new Map<string, ResolveOutput>();
  const uncertain = [] as typeof candidates;
  const exact = candidates.filter((item) => item.candidates[0]?.confidence >= .9);
  uncertain.push(...candidates.filter((item) => item.candidates[0]?.confidence < .9));
  await Promise.all(exact.map(async (item) => resolved.set(item.key, await resolveTaxonomyConcept(item.input))));
  if (uncertain.length) {
    const batch = await generateStructured(`${systemPrompts.taxonomyResolver}\nĐây là bước chọn candidate theo batch, không tạo label. Trả đúng JSON {"resolutions":[{"key":"giữ nguyên key input","selected_id":"candidate id hoặc null","confidence":0.0,"reason":"lý do ngắn"}]}. Phải trả đúng một phần tử cho mỗi concept, đúng thứ tự input. Chỉ chọn selected_id khi candidate thực sự cùng khái niệm; nếu không đủ chắc chắn, trả null.`, { concepts: uncertain.map((item) => ({ key: item.key, raw_text: item.input.rawText, interpreted_text: item.input.interpretedText ?? item.input.rawText, entity_type: item.input.type, candidates: item.candidates.map((candidate) => ({ id: candidate.label.id, name: candidate.label.preferredName, type: candidate.label.type, confidence: candidate.confidence })) })) }, batchSelectionSchema, "fast").catch(() => ({ resolutions: [] }));
    const selections = new Map(batch.resolutions.map((item, index) => [item.key || uncertain[index]?.key, item]).filter((item): item is [string, typeof batch.resolutions[number]] => Boolean(item[0])));
    await Promise.all(uncertain.map(async (item) => {
      const selection = selections.get(item.key);
      const selected = selection?.selected_id ? item.candidates.find((candidate) => candidate.label.id === selection.selected_id) : null;
      if (selected && selection!.confidence >= .72) {
        const interpretedText = item.input.interpretedText?.trim() || item.input.rawText.trim();
        await db.taxonomyAlias.upsert({ where: { normalized_labelId: { normalized: normalizeTaxonomyText(interpretedText), labelId: selected.label.id } }, update: { alias: interpretedText }, create: { labelId: selected.label.id, alias: interpretedText, normalized: normalizeTaxonomyText(interpretedText), kind: "batch_semantic_alias" } });
        await db.taxonomyResolution.create({ data: { taxonomyLabelId: selected.label.id, rawText: item.input.rawText, interpretedText, entityType: item.input.type, action: "USE_EXISTING", confidence: selection!.confidence, evidence: item.input.evidence, model: modelFor("fast"), metadata: { method: "batch_semantic", reason: selection!.reason } } });
        resolved.set(item.key, { label: selected.label, confidence: selection!.confidence, method: "batch_semantic", action: "USE_EXISTING" });
      } else resolved.set(item.key, await createBroadConcept(item.input));
    }));
  }
  return Promise.all(inputs.map(async (input) => {
    const key = `${input.type}:${normalizeTaxonomyText(input.interpretedText?.trim() || input.rawText)}`;
    return resolved.get(key) ?? resolveTaxonomyConcept(input);
  }));
}

export async function resolveTaxonomyConceptsFast(inputs: ResolveInput[]): Promise<ResolveOutput[]> {
  return Promise.all(inputs.map(async (input) => {
    const candidates = await findTaxonomyCandidates(input.interpretedText?.trim() || input.rawText, input.type, 3);
    if (candidates[0]?.confidence >= .72) return { label: candidates[0].label, confidence: candidates[0].confidence, method: candidates[0].method, action: "USE_EXISTING" as const };
    return createBroadConcept(input, .65, "deterministic_broad");
  }));
}

export async function taxonomyNeighborhood(ids: string[]) {
  const edges = await db.taxonomyEdge.findMany({ where: { OR: [{ fromId: { in: ids } }, { toId: { in: ids } }] }, include: { from: true, to: true } });
  return edges.map((edge) => ({ from: edge.from.preferredName, relation: edge.relation, to: edge.to.preferredName, confidence: edge.confidence }));
}
