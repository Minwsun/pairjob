import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { syncCanonicalJob } from "@/lib/jobs/sync";
import { resolveTaxonomyConcept } from "@/lib/taxonomy/semantic-resolver";
import { compensationPeriod } from "@/lib/compensation";
import { refreshCanonicalRequirements } from "@/lib/jobs/canonical-requirements";
import { after } from "next/server";
import { matchingSkillMappingIds } from "@/lib/jobs/skill-requirement-mapping";

const schema = z.object({ value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(), skipped: z.boolean().default(false) });
const finiteNumber = (value: unknown) => { const number = Number(value); if (!Number.isFinite(number)) throw new Error("INVALID_NUMERIC_ANSWER"); return number; };

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; questionId: string }> }) {
  try {
    const { id, questionId } = await context.params; const input = schema.parse(await request.json());
    const question = await db.clarificationQuestion.findFirstOrThrow({ where: { id: questionId, jobId: id } });
    if (question.required && input.skipped) throw new Error("REQUIRED_QUESTION_CANNOT_BE_SKIPPED");
    const resolvedOccupation = !input.skipped && question.field === "occupation" ? await resolveTaxonomyConcept({ rawText: String(input.value), interpretedText: String(input.value), type: "occupation", evidence: question.question }) : null;
    await db.$transaction(async (transaction) => {
      await transaction.clarificationAnswer.upsert({ where: { questionId }, update: { value: input.value ?? "", skipped: input.skipped }, create: { questionId, value: input.value ?? "", skipped: input.skipped } });
      await transaction.clarificationQuestion.update({ where: { id: questionId }, data: { status: input.skipped ? "SKIPPED" : "ANSWERED" } });
      if (!input.skipped) {
        const value = input.value;
        if (question.field === "occupation") {
          const name = String(value).trim(); const labelId = resolvedOccupation!.label.id;
          await transaction.jobLabelMapping.upsert({ where: { id: (await transaction.jobLabelMapping.findFirst({ where: { jobId: id, labelType: "occupation" } }))?.id ?? "missing" }, update: { taxonomyLabelId: labelId, confirmed: true, confidence: resolvedOccupation!.confidence, method: "ai_auto_resolved" }, create: { jobId: id, taxonomyLabelId: labelId, rawText: name, labelType: "occupation", confidence: resolvedOccupation!.confidence, method: "ai_auto_resolved", confirmed: true } });
          await syncCanonicalJob(transaction, id);
        }
        else if (question.field === "experience_policy") { const number = finiteNumber(value); await transaction.job.update({ where: { id }, data: { experienceMin: number, experiencePolicy: number === 0 ? "none" : "minimum" } }); }
        else if (question.field === "work_mode") await transaction.job.update({ where: { id }, data: { workMode: String(value) } });
        else if (question.field === "availability_min") await transaction.job.update({ where: { id }, data: { availabilityMin: finiteNumber(value) } });
        else if (question.field === "budget_max") await transaction.job.update({ where: { id }, data: { budgetMax: finiteNumber(value), currency: "VND" } });
        else if (question.field === "deadline") await transaction.job.update({ where: { id }, data: { deadlineText: String(value) } });
        else if (question.field === "contract_type") await transaction.job.update({ where: { id }, data: { contractType: String(value), compensationPeriod: compensationPeriod(String(value)) } });
        else if (question.field === "location") await transaction.job.update({ where: { id }, data: { locationText: String(value) } });
        else if (question.field.startsWith("language_level:")) {
          const language = question.field.slice("language_level:".length);
          const job = await transaction.job.findUniqueOrThrow({ where: { id } });
          const requirements = Array.isArray(job.languageRequirements) ? job.languageRequirements as Record<string, unknown>[] : [];
          await transaction.job.update({ where: { id }, data: { languageRequirements: requirements.map((item) => item.interpreted_name === language ? { ...item, level: String(value) } : item) as Prisma.InputJsonValue } });
        }
        else if (question.field.startsWith("certification_detail:")) {
          const certification = question.field.slice("certification_detail:".length);
          const job = await transaction.job.findUniqueOrThrow({ where: { id } });
          const requirements = Array.isArray(job.certificationRequirements) ? job.certificationRequirements as Record<string, unknown>[] : [];
          await transaction.job.update({ where: { id }, data: { certificationRequirements: requirements.map((item) => item.interpreted_name === certification ? { ...item, detail: String(value) } : item) as Prisma.InputJsonValue } });
        }
        else if (question.field.startsWith("skill_requirement:")) {
          const rawText = question.field.slice("skill_requirement:".length);
          const mappings = await transaction.jobLabelMapping.findMany({ where: { jobId: id, labelType: "skill" }, include: { taxonomyLabel: true } });
          const mappingIds = matchingSkillMappingIds(mappings, rawText);
          if (!mappingIds.length) throw new Error(`SKILL_REQUIREMENT_MAPPING_NOT_FOUND:${rawText}`);
          await transaction.jobLabelMapping.updateMany({ where: { id: { in: mappingIds } }, data: { requirementType: String(value), requirementConfidence: 1, requirementReason: "Nhà tuyển dụng xác nhận qua popup làm rõ." } });
          await syncCanonicalJob(transaction, id);
          const unresolved = await transaction.jobLabelMapping.count({ where: { jobId: id, labelType: "skill", requirementType: { in: ["unknown", "uncertain"] } } });
          await transaction.job.update({ where: { id }, data: { skillRequirementPolicy: unresolved ? "NEEDS_CLARIFICATION" : "USER_CONFIRMED" } });
        }
      }
      const pending = await transaction.clarificationQuestion.count({ where: { jobId: id, status: "PENDING" } });
      await transaction.job.update({ where: { id }, data: { clarificationDone: pending === 0, status: pending === 0 ? "READY_FOR_REVIEW" : "CLARIFYING" } });
    });
    after(() => refreshCanonicalRequirements(id).catch(() => undefined));
    const next = await db.clarificationQuestion.findFirst({ where: { jobId: id, status: "PENDING" }, orderBy: [{ impact: "desc" }, { position: "asc" }] });
    return NextResponse.json({ data: { next }, errors: [], requestId: crypto.randomUUID() });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "CLARIFICATION_ANSWER_FAILED", message: error instanceof Error ? error.message : "Unknown error" }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
