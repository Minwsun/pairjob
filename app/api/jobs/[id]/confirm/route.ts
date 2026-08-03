import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { after } from "next/server";
import { recommendCandidates } from "@/lib/recommendation-engine";
import { matchingSkillMappingIds, safeRequirementType } from "@/lib/jobs/skill-requirement-mapping";
import { normalizeTaxonomyText } from "@/lib/taxonomy/service";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let job = await db.job.findUniqueOrThrow({ where: { id }, include: { labelMappings: { include: { taxonomyLabel: true } }, clarifications: { include: { answer: true } } } });
  const unresolvedBeforeRepair = job.labelMappings.filter((mapping) => mapping.labelType === "skill" && (!mapping.confirmed || mapping.requirementType === "unknown" || mapping.requirementType === "uncertain" || !mapping.requirementType));
  for (const question of job.clarifications.filter((item) => item.status === "ANSWERED" && item.field.startsWith("skill_requirement:") && item.answer && !item.answer.skipped)) {
    const value = String(question.answer!.value);
    if (!["required", "preferred", "not_required"].includes(value)) continue;
    const mappingIds = matchingSkillMappingIds(unresolvedBeforeRepair, question.field.slice("skill_requirement:".length));
    if (mappingIds.length) await db.jobLabelMapping.updateMany({ where: { id: { in: mappingIds } }, data: { requirementType: value, requirementConfidence: 1, requirementReason: "Khôi phục từ câu trả lời làm rõ đã lưu." } });
  }
  const extraction = job.extraction && typeof job.extraction === "object" && !Array.isArray(job.extraction) ? job.extraction as Record<string, unknown> : {};
  const extractedSkills = Array.isArray(extraction.skills_detected) ? extraction.skills_detected as Record<string, unknown>[] : [];
  for (const mapping of unresolvedBeforeRepair) {
    if (!mapping.taxonomyLabelId) continue;
    const names = [mapping.rawText, mapping.interpretedText, mapping.taxonomyLabel?.preferredName].filter(Boolean).map((value) => normalizeTaxonomyText(String(value)));
    const extracted = extractedSkills.find((skill) => names.includes(normalizeTaxonomyText(String(skill.raw_name ?? ""))));
    const requirementType = safeRequirementType(extracted?.requirement_type);
    await db.jobLabelMapping.update({ where: { id: mapping.id }, data: { confirmed: true, requirementType, requirementConfidence: Number(extracted?.requirement_confidence ?? .6), requirementReason: requirementType === "preferred" ? "Tự chuyển thành kỹ năng ưu tiên vì JD chưa khẳng định bắt buộc." : "Khôi phục từ kết quả trích xuất JD." } });
  }
  if (!job.experiencePolicy) await db.job.update({ where: { id }, data: { experiencePolicy: job.experienceMin > 0 ? "minimum" : "none" } });
  await db.clarificationQuestion.updateMany({ where: { jobId: id, status: "PENDING", OR: [{ field: { startsWith: "skill_requirement:" } }, { field: "experience_policy" }] }, data: { status: "INVALIDATED" } });
  job = await db.job.findUniqueOrThrow({ where: { id }, include: { labelMappings: { include: { taxonomyLabel: true } }, clarifications: { include: { answer: true } } } });
  const blocking: string[] = [];
  if (!job.labelMappings.some((mapping) => mapping.labelType === "occupation" && mapping.mappingRole === "primary" && mapping.confirmed)) blocking.push("occupation");
  const unresolvedSkills = job.labelMappings.filter((mapping) => mapping.labelType === "skill" && (!mapping.confirmed || mapping.requirementType === "unknown" || mapping.requirementType === "uncertain" || !mapping.requirementType));
  if (unresolvedSkills.length) blocking.push(`unresolved_skill_requirements:${unresolvedSkills.map((mapping) => mapping.rawText).join("|")}`);
  if (!job.experiencePolicy) blocking.push("experience_policy");
  if (job.clarifications.some((question) => question.required && question.status === "PENDING")) blocking.push("required_clarifications");
  if (blocking.length) return NextResponse.json({ data: null, errors: [{ code: "JOB_NOT_READY", message: `Cần xác nhận: ${blocking.join(", ")}` }], requestId: crypto.randomUUID() }, { status: 400 });
  const updated = await db.job.update({ where: { id }, data: { confirmed: true, published: true, publishedAt: job.publishedAt ?? new Date(), status: "PUBLISHED", skillRequirementPolicy: job.skillRequirementPolicy === "NEEDS_CLARIFICATION" ? "USER_CONFIRMED" : job.skillRequirementPolicy } });
  after(() => recommendCandidates(updated.id).catch(() => undefined));
  return NextResponse.json({ data: updated, errors: [], requestId: crypto.randomUUID() });
}
