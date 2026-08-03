import { db } from "@/lib/db";
import { jobExtractionSchema } from "@/lib/ai/schemas";
import { systemPrompts } from "@/lib/prompts";
import { extractWithAgent } from "@/lib/ai/extraction-agent";
import { analyzeTaxonomyPhrase, normalizeTaxonomyText } from "@/lib/taxonomy/service";
import { resolveTaxonomyConcept, resolveTaxonomyConcepts } from "@/lib/taxonomy/semantic-resolver";
import { buildClarificationQuestions } from "@/lib/jobs/clarifications";
import { jobSearchDocument } from "@/lib/embeddings/documents";
import type { ProgressReporter } from "@/lib/progress";
import { compensationPeriod } from "@/lib/compensation";
import { refreshJobEmbedding } from "@/lib/embeddings/store";

const noop: ProgressReporter = () => {};

export async function extractJob(id: string, report: ProgressReporter = noop) {
  report({ type: "stage_started", stage: "load_job", label: "Đọc yêu cầu tuyển dụng", progress: 5 });
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  report({ type: "stage_completed", stage: "load_job", label: "Đã đọc yêu cầu tuyển dụng", progress: 10 });
  report({ type: "stage_started", stage: "extract", label: "AI đang hiểu toàn bộ JD", progress: 15 });
  const extractionRun = await extractWithAgent({ skill: "analyze_job", system: systemPrompts.jobExtractor, rawText: `${job.rawTitle}\n${job.rawDescription}`, context: { raw_title: job.rawTitle, raw_description: job.rawDescription }, outputSchema: jobExtractionSchema, actorId: job.ownerId });
  const extracted = extractionRun.output;
  report({ type: "stage_completed", stage: "extract", label: "Đã trích xuất yêu cầu và evidence", progress: 38, message: `${extracted.skills_detected.length} kỹ năng được nhận diện` });
  report({ type: "stage_started", stage: "occupation", label: "Chuẩn hóa nghề nghiệp", progress: 42 });
  const phraseResolution = extracted.occupation_text ? await analyzeTaxonomyPhrase(extracted.occupation_text, "occupation") : null;
  const interpretedMention = (rawText: string, type: string) => extracted.mentions.find((mention) => mention.entity_type === type && mention.raw_text === rawText)?.interpreted_text ?? rawText;
  const rawOccupation = extracted.mentions.find((mention) => mention.entity_type === "occupation")?.raw_text ?? extracted.occupation_text;
  const occupation = phraseResolution?.primary ? { label: phraseResolution.primary.label, confidence: phraseResolution.primary.confidence, method: phraseResolution.method, action: "USE_EXISTING" as const } : extracted.occupation_text ? await resolveTaxonomyConcept({ rawText: rawOccupation!, interpretedText: extracted.occupation_text, type: "occupation", evidence: rawOccupation ?? undefined }) : null;
  report({ type: "stage_completed", stage: "occupation", label: "Đã chuẩn hóa nghề nghiệp", progress: 52, message: occupation?.label.preferredName ?? "Chưa đủ dữ liệu xác định nghề" });
  report({ type: "stage_started", stage: "taxonomy", label: "Đang dò cây kỹ năng và bằng cấp", progress: 56 });
  const concepts = [
    ...extracted.skills_detected.map((skill) => ({ rawText: skill.raw_name, interpretedText: interpretedMention(skill.raw_name, "skill"), type: "skill", evidence: skill.evidence.source_text })),
    ...extracted.languages_detected.map((item) => ({ rawText: item.raw_name, interpretedText: item.interpreted_name, type: "language", evidence: item.evidence.source_text })),
    ...extracted.certifications_detected.map((item) => ({ rawText: item.raw_name, interpretedText: item.interpreted_name, type: "certification", evidence: item.evidence.source_text })),
    ...extracted.education_requirements.map((item) => ({ rawText: item.raw_name, interpretedText: item.interpreted_name, type: item.entity_type, evidence: item.evidence.source_text })),
  ];
  const resolutions = await resolveTaxonomyConcepts(concepts);
  let resolutionIndex = 0;
  const skills = extracted.skills_detected.map((skill) => ({ skill, interpretedText: interpretedMention(skill.raw_name, "skill"), resolution: resolutions[resolutionIndex++] }));
  const languages = extracted.languages_detected.map((item) => ({ item, resolution: resolutions[resolutionIndex++] }));
  const certifications = extracted.certifications_detected.map((item) => ({ item, resolution: resolutions[resolutionIndex++] }));
  const education = extracted.education_requirements.map((item) => ({ item, resolution: resolutions[resolutionIndex++] }));
  const requirementType = (value: string) => value === "unknown" ? "uncertain" : value;
  const requiredSkills = skills.filter(({ skill }) => requirementType(skill.requirement_type) === "required").map(({ skill, resolution }) => ({ id: resolution.label.id, label: resolution.label.preferredName, level: Math.max(1, Math.min(5, skill.importance)) }));
  const preferredSkills = skills.filter(({ skill }) => skill.requirement_type === "preferred").map(({ resolution }) => ({ id: resolution.label.id, label: resolution.label.preferredName }));
  report({ type: "stage_completed", stage: "taxonomy", label: "Đã chuẩn hóa taxonomy", progress: 76, message: `${requiredSkills.length} bắt buộc · ${preferredSkills.length} ưu tiên` });
  report({ type: "stage_started", stage: "clarifications", label: "Phát hiện yêu cầu cần làm rõ", progress: 80 });
  const completeness = [extracted.occupation_text, requiredSkills.length, extracted.experience_min_years, extracted.work_mode, extracted.budget_max, extracted.availability_min].filter(Boolean).length / 6;
  const questions = buildClarificationQuestions(extracted, Boolean(occupation));
  report({ type: "stage_completed", stage: "clarifications", label: "Đã lập danh sách làm rõ", progress: 86, message: questions.length ? `${questions.length} điểm cần hỏi thêm` : "Không còn câu hỏi bắt buộc" });
  report({ type: "stage_started", stage: "save", label: "Lưu canonical job", progress: 90 });
  await db.$transaction(async (transaction) => {
    await transaction.clarificationQuestion.deleteMany({ where: { jobId: id } });
    await transaction.jobLabelMapping.deleteMany({ where: { jobId: id } });
    if (occupation) {
      await transaction.jobLabelMapping.create({ data: { jobId: id, taxonomyLabelId: occupation.label.id, rawText: rawOccupation!, interpretedText: extracted.occupation_text!, labelType: "occupation", confidence: occupation.confidence, method: occupation.method, evidence: rawOccupation, mappingRole: "primary", confirmed: true, derivedFrom: phraseResolution?.components.map((component) => ({ rawText: component.rawText, labelId: component.candidate.label.id })) ?? [] } });
      if (phraseResolution && phraseResolution.relation !== "single") for (const component of phraseResolution.components) await transaction.jobLabelMapping.create({ data: { jobId: id, taxonomyLabelId: component.candidate.label.id, rawText: component.rawText, interpretedText: component.candidate.label.preferredName, labelType: "occupation", confidence: component.candidate.confidence, method: component.candidate.method, evidence: extracted.occupation_text, mappingRole: "component", confirmed: true } });
    }
    for (const { skill, interpretedText, resolution } of skills) await transaction.jobLabelMapping.create({ data: { jobId: id, taxonomyLabelId: resolution.label.id, rawText: skill.raw_name, interpretedText, labelType: "skill", requirementType: requirementType(skill.requirement_type), requirementConfidence: skill.requirement_confidence, requirementReason: skill.requirement_reason, importance: skill.importance, confidence: resolution.confidence, method: resolution.method, evidence: skill.evidence.source_text, confirmed: true } });
    for (const { item, resolution } of languages) await transaction.jobLabelMapping.create({ data: { jobId: id, taxonomyLabelId: resolution.label.id, rawText: item.raw_name, interpretedText: item.interpreted_name, labelType: "language", requirementType: item.required ? "required" : "preferred", confidence: resolution.confidence, method: resolution.method, evidence: item.evidence.source_text, confirmed: true } });
    for (const { item, resolution } of certifications) await transaction.jobLabelMapping.create({ data: { jobId: id, taxonomyLabelId: resolution.label.id, rawText: item.raw_name, interpretedText: item.interpreted_name, labelType: "certification", requirementType: item.required ? "required" : "preferred", confidence: resolution.confidence, method: resolution.method, evidence: item.evidence.source_text, confirmed: true } });
    for (const { item, resolution } of education) await transaction.jobLabelMapping.create({ data: { jobId: id, taxonomyLabelId: resolution.label.id, rawText: item.raw_name, interpretedText: item.interpreted_name, labelType: item.entity_type, requirementType: item.requirement_type, confidence: resolution.confidence, method: resolution.method, evidence: item.evidence.source_text, confirmed: item.requirement_type !== "uncertain" } });
    if (questions.length) await transaction.clarificationQuestion.createMany({ data: questions.map((question) => ({ ...question, jobId: id })) });
    const hasUncertainSkill = skills.some(({ skill }) => requirementType(skill.requirement_type) === "uncertain");
    const canonical = { displayTitle: job.rawTitle, rawTitle: job.rawTitle, rawDescription: job.rawDescription, occupation: occupation?.label.id, requiredSkills, preferredSkills, domains: extracted.domains_detected.map((domain) => normalizeTaxonomyText(domain).replace(/ /g, "_")), educationRequirements: education.map(({ item, resolution }) => ({ id: resolution.label.id, label: resolution.label.preferredName, type: item.entity_type, requirementType: item.requirement_type, evidence: item.evidence.source_text })) };
    await transaction.job.update({ where: { id }, data: { extraction: extracted, status: questions.length ? "CLARIFYING" : "READY_FOR_REVIEW", occupation: canonical.occupation, requiredSkills, preferredSkills, domains: canonical.domains, languageRequirements: extracted.languages_detected, certificationRequirements: extracted.certifications_detected, educationRequirements: canonical.educationRequirements, experienceMin: extracted.experience_min_years ?? 0, experiencePolicy: extracted.experience_min_years === null ? null : extracted.experience_min_years === 0 ? "none" : "minimum", workMode: extracted.work_mode, availabilityMin: extracted.availability_min ?? 0, budgetMax: extracted.budget_max ?? 0, deadlineText: extracted.deadline_text, projectDurationText: extracted.project_duration_text, currency: "VND", compensationPeriod: compensationPeriod(job.contractType), missingFields: extracted.missing_fields, completeness, clarificationDone: questions.length === 0, skillRequirementPolicy: hasUncertainSkill ? "NEEDS_CLARIFICATION" : "AI_CONFIRMED", searchDocument: jobSearchDocument(canonical), embeddingModel: null, embeddingUpdatedAt: null } });
  });
  await db.$executeRaw`UPDATE "Job" SET embedding = NULL, "queryEmbedding" = NULL WHERE id = ${id}`;
  await refreshJobEmbedding(id);
  const updated = await db.job.findUniqueOrThrow({ where: { id }, include: { labelMappings: { include: { taxonomyLabel: true } }, clarifications: { orderBy: { position: "asc" } } } });
  report({ type: "stage_completed", stage: "save", label: "Canonical job đã được lưu", progress: 98 });
  return updated;
}
