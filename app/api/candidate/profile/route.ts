import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";
import { profileSnapshot } from "@/lib/profile-snapshot";
import { resolveTaxonomyConcept } from "@/lib/taxonomy/semantic-resolver";
import { candidateSearchDocument } from "@/lib/embeddings/documents";
import { enqueueRecompute } from "@/lib/recompute";
import type { Prisma } from "@prisma/client";

const evidence = z.object({ sourceType: z.enum(["job_description", "experience", "project", "skills"]), sourceText: z.string(), confidence: z.number().min(0).max(1) });
const skill = z.object({ id: z.string().optional(), label: z.string().min(1), level: z.number().min(1).max(5), years: z.number().min(0), evidence: z.array(evidence).default([]) });
const schema = z.object({
  expectedVersion: z.number().int().positive(), displayTitle: z.string().nullable(), occupation: z.string().nullable(), skills: z.array(skill), domains: z.array(z.string()), experiences: z.array(z.record(z.string(), z.unknown())), projects: z.array(z.record(z.string(), z.unknown())), education: z.array(z.record(z.string(), z.unknown())), experienceYears: z.number().min(0), workModes: z.array(z.string()), availabilityHours: z.number().int().min(0).nullable(), hourlyRate: z.number().min(0).nullable(), selectedTargetOccupationId: z.string().nullable(),
});

export async function GET() {
  const { profile } = await getDemoCandidate();
  const [documents, latestTask, revisions] = await Promise.all([
    db.document.findMany({ where: { ownerId: profile.userId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.recomputeTask.findFirst({ where: { candidateProfileId: profile.id }, orderBy: { createdAt: "desc" } }),
    db.profileRevision.findMany({ where: { candidateProfileId: profile.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, version: true, source: true, createdAt: true } }),
  ]);
  return NextResponse.json({ data: { profile, documents, latestTask, revisions }, errors: [], requestId: crypto.randomUUID() });
}

export async function PATCH(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const { profile } = await getDemoCandidate();
    if (profile.profileVersion !== input.expectedVersion) return NextResponse.json({ data: null, errors: [{ code: "PROFILE_VERSION_CONFLICT", message: "Hồ sơ đã thay đổi. Tải lại trước khi lưu." }], requestId: crypto.randomUUID() }, { status: 409 });
    const occupation = input.occupation ? await resolveTaxonomyConcept({ rawText: input.occupation, type: "occupation", evidence: input.displayTitle ?? input.occupation }) : null;
    const skills = await Promise.all(input.skills.map(async (item) => { const resolution = item.id ? null : await resolveTaxonomyConcept({ rawText: item.label, type: "skill", evidence: item.evidence[0]?.sourceText }); return { ...item, id: item.id ?? resolution!.label.id, label: resolution?.label.preferredName ?? item.label, verifiedByUser: true }; }));
    const nextVersion = profile.profileVersion + 1;
    const data = { displayTitle: input.displayTitle, occupation: occupation?.label.id ?? input.occupation, skills: skills as Prisma.InputJsonValue, domains: input.domains as Prisma.InputJsonValue, experiences: input.experiences as Prisma.InputJsonValue, projects: input.projects as Prisma.InputJsonValue, education: input.education as Prisma.InputJsonValue, experienceYears: input.experienceYears, workModes: input.workModes as Prisma.InputJsonValue, availabilityHours: input.availabilityHours, hourlyRate: input.hourlyRate, selectedTargetOccupationId: input.selectedTargetOccupationId, profileVersion: nextVersion, verified: true };
    const assertions = [
      ...(occupation ? [{ candidateProfileId: profile.id, taxonomyLabelId: occupation.label.id, assertionType: "EXPLICIT", proficiency: null, confidence: 1, evidence: [{ sourceType: "skills", sourceText: input.displayTitle ?? input.occupation ?? occupation.label.preferredName, confidence: 1 }] as Prisma.InputJsonValue, sourceVersion: nextVersion }] : []),
      ...skills.map((item) => ({ candidateProfileId: profile.id, taxonomyLabelId: item.id, assertionType: "EXPLICIT", proficiency: item.level, confidence: item.evidence.length ? Math.max(...item.evidence.map((entry) => entry.confidence)) : .7, evidence: item.evidence as Prisma.InputJsonValue, sourceVersion: nextVersion })),
    ];
    const updated = await db.$transaction(async (tx) => {
      await tx.profileRevision.create({ data: { candidateProfileId: profile.id, version: profile.profileVersion, source: "MANUAL_EDIT", snapshot: profileSnapshot(profile) } });
      await tx.candidateConceptAssertion.updateMany({ where: { candidateProfileId: profile.id, active: true }, data: { active: false } });
      if (assertions.length) await tx.candidateConceptAssertion.createMany({ data: assertions });
      return tx.candidateProfile.update({ where: { id: profile.id }, data: { ...data, searchDocument: candidateSearchDocument({ ...data, evidenceQuality: profile.evidenceQuality, completeness: profile.completeness }) } });
    });
    const task = await enqueueRecompute(profile.id, nextVersion);
    return NextResponse.json({ data: { profile: updated, task }, errors: [], requestId: crypto.randomUUID() });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "PROFILE_UPDATE_FAILED", message: error instanceof Error ? error.message : String(error) }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
