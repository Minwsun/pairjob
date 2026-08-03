import { db } from "@/lib/db";
import { generateStructured } from "@/lib/ai/client";
import { canonicalJobRequirementsSchema } from "@/lib/ai/schemas";
import { systemPrompts } from "@/lib/prompts";

export async function refreshCanonicalRequirements(jobId: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId }, include: { clarifications: { include: { answer: true }, orderBy: { position: "asc" } } } });
  const facts = {
    title: job.displayTitle ?? job.rawTitle,
    corrected_description: job.extraction && typeof job.extraction === "object" && !Array.isArray(job.extraction) ? (job.extraction as Record<string, unknown>).corrected_interpretation : null,
    occupation: job.occupation,
    required_skills: job.requiredSkills,
    preferred_skills: job.preferredSkills,
    experience_min: job.experienceMin,
    work_mode: job.workMode,
    contract_type: job.contractType,
    availability_min: job.availabilityMin,
    compensation: { min: job.budgetMin, max: job.budgetMax, currency: job.currency, period: job.compensationPeriod },
    location: job.locationText,
    deadline: job.deadlineText,
    languages: job.languageRequirements,
    certifications: job.certificationRequirements,
    education: job.educationRequirements,
    clarification_answers: job.clarifications.filter((item) => item.status === "ANSWERED" && item.answer && !item.answer.skipped).map((item) => ({ field: item.field, answer: item.answer!.value })),
  };
  const output = await generateStructured(systemPrompts.canonicalJobRequirements, facts, canonicalJobRequirementsSchema, "fast");
  return db.job.update({ where: { id: jobId }, data: { canonicalSummary: output.summary, canonicalRequirements: output.requirements } });
}
