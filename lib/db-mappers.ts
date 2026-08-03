import type { CandidateProfile, Job as DbJob, User } from "@prisma/client";
import type { Candidate, Job, Skill } from "./types";

const jsonArray = <T>(value: unknown) => Array.isArray(value) ? value as T[] : [];

export function jobFromDb(job: DbJob): Job {
  const ageDays = Math.max(0, (Date.now() - (job.publishedAt ?? job.createdAt).getTime()) / 86_400_000);
  const extraction = job.extraction && typeof job.extraction === "object" && !Array.isArray(job.extraction) ? job.extraction as Record<string, unknown> : {};
  return {
    id: job.id, title: job.displayTitle ?? job.rawTitle, company: job.company ?? "Chưa cập nhật", occupation: job.occupation ?? "unknown",
    requiredSkills: jsonArray(job.requiredSkills), preferredSkills: jsonArray(job.preferredSkills), domains: jsonArray(job.domains),
    experienceMin: job.experienceMin, workMode: job.workMode ?? "flexible", availabilityMin: job.availabilityMin, budgetMin: job.budgetMin, budgetMax: job.budgetMax, compensation: { min: job.budgetMin || null, max: job.budgetMax || null, currency: "VND", period: job.compensationPeriod === "MONTH" ? "MONTH" : job.compensationPeriod === "PROJECT" ? "PROJECT" : "HOUR" }, freshness: Math.exp(-ageDays / 30),
    rawDescription: job.rawDescription, correctedInterpretation: typeof extraction.corrected_interpretation === "string" ? extraction.corrected_interpretation : null,
    contractType: job.contractType, locationText: job.locationText, deadlineText: job.deadlineText,
    languageRequirements: jsonArray(job.languageRequirements), certificationRequirements: jsonArray(job.certificationRequirements), educationRequirements: jsonArray(job.educationRequirements),
  };
}

export function candidateFromDb(profile: CandidateProfile & { user: User }): Candidate {
  return {
    id: profile.id, name: profile.user.displayName, title: profile.displayTitle ?? "Chưa cập nhật", occupation: profile.occupation ?? "unknown",
    skills: jsonArray<Skill>(profile.skills), domains: jsonArray(profile.domains), experienceYears: profile.experienceYears,
    workModes: jsonArray(profile.workModes), availability: profile.availabilityHours, evidenceQuality: profile.evidenceQuality, rate: profile.expectedCompensationMax ?? profile.hourlyRate, compensation: { min: profile.expectedCompensationMin ?? profile.hourlyRate, max: profile.expectedCompensationMax ?? profile.hourlyRate, currency: "VND", period: profile.compensationPeriod === "MONTH" ? "MONTH" : "HOUR" },
    education: jsonArray(profile.education).map((item: any) => ({ degreeLevelId: item.degreeLevelId ?? null, fieldOfStudyId: item.fieldOfStudyId ?? null, degree: item.degree ?? null, field: item.field ?? null })),
  };
}
