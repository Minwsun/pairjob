import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";
import { profileSnapshot } from "@/lib/profile-snapshot";
import { candidateSearchDocument } from "@/lib/embeddings/documents";
import { enqueueRecompute } from "@/lib/recompute";
import { resolveTaxonomyConcept } from "@/lib/taxonomy/semantic-resolver";

const answerValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const schema = z.object({ answers: z.array(z.object({ questionId: z.string(), value: answerValue.optional(), skipped: z.boolean().default(false) })).min(1).max(3) });
const array = <T>(value: unknown) => Array.isArray(value) ? value as T[] : [];
const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => { const result = Number(value); if (!Number.isFinite(result)) throw new Error("INVALID_NUMERIC_ANSWER"); return result; };
const negative = (value: unknown) => /^(no|false|khong|chua|chưa|không)/i.test(text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
const basic = (value: unknown) => /(basic|co ban|cơ bản|tiep xuc|tiếp xúc)/i.test(text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const { profile } = await getDemoCandidate();
    const questions = await db.candidateClarificationQuestion.findMany({ where: { id: { in: input.answers.map((item) => item.questionId) }, candidateProfileId: profile.id, profileVersion: profile.profileVersion, status: "PENDING" } });
    if (questions.length !== input.answers.length) throw new Error("CANDIDATE_CLARIFICATION_STALE");
    const byId = new Map(questions.map((question) => [question.id, question]));
    for (const answer of input.answers) if (byId.get(answer.questionId)?.required && (answer.skipped || !text(answer.value))) throw new Error("REQUIRED_QUESTION_CANNOT_BE_SKIPPED");
    const occupationAnswer = input.answers.find((answer) => byId.get(answer.questionId)?.field === "occupation_focus" && !answer.skipped && text(answer.value));
    const resolvedOccupation = occupationAnswer ? await resolveTaxonomyConcept({ rawText: text(occupationAnswer.value), type: "occupation", evidence: byId.get(occupationAnswer.questionId)!.question }) : null;
    const conceptIds = questions.map((question) => question.conceptId).filter(Boolean) as string[];
    const conceptNames = new Map((await db.taxonomyLabel.findMany({ where: { id: { in: conceptIds } }, select: { id: true, preferredName: true } })).map((label) => [label.id, label.preferredName]));
    const skills: Record<string, any>[] = array<Record<string, any>>(profile.skills).map((skill) => ({ ...skill, evidence: array<Record<string, unknown>>(skill.evidence) }));
    const projects = array<Record<string, unknown>>(profile.projects);
    const experiences = array<Record<string, unknown>>(profile.experiences);
    let occupation = profile.occupation;
    let availabilityHours = profile.availabilityHours;
    let hourlyRate = profile.hourlyRate;
    let workModes = array<string>(profile.workModes);
    const assertionChanges: { conceptId: string; assertionType: string; proficiency: number | null; confidence: number; evidence: Prisma.InputJsonValue }[] = [];
    for (const answer of input.answers) {
      if (answer.skipped) continue;
      const question = byId.get(answer.questionId)!;
      const value = answer.value;
      if (question.field === "occupation_focus") occupation = resolvedOccupation?.label.id ?? occupation;
      else if (question.field === "availability_hours") availabilityHours = Math.max(0, Math.round(number(value)));
      else if (question.field === "hourly_rate") hourlyRate = Math.max(0, number(value));
      else if (question.field === "work_modes") workModes = Array.isArray(value) ? value.map(String) : text(value).split(",").map((item) => item.trim()).filter(Boolean);
      else if (question.field.startsWith("skill_")) {
        const conceptId = question.field.slice(question.field.indexOf(":") + 1);
        const index = skills.findIndex((skill) => skill.id === conceptId);
        if (question.field.startsWith("skill_confirm:")) {
          if (negative(value)) {
            if (index >= 0) skills.splice(index, 1);
            assertionChanges.push({ conceptId, assertionType: "NEGATIVE", proficiency: null, confidence: 1, evidence: [{ sourceType: "skills", sourceText: question.question, answer: text(value), confidence: 1 }] as Prisma.InputJsonValue });
          } else {
            const level = basic(value) ? 1 : Math.max(2, index >= 0 ? Number(skills[index].level ?? 3) : 3);
            if (index >= 0) skills[index] = { ...skills[index], level };
            else skills.push({ id: conceptId, label: conceptNames.get(conceptId) ?? conceptId, level, years: 0, evidence: [] });
            assertionChanges.push({ conceptId, assertionType: "EXPLICIT", proficiency: level, confidence: basic(value) ? .6 : .75, evidence: [{ sourceType: "skills", sourceText: question.question, answer: text(value), confidence: basic(value) ? .6 : .75 }] as Prisma.InputJsonValue });
          }
        } else if (index >= 0 && question.field.startsWith("skill_evidence:")) {
          const evidence = { sourceType: "skills", sourceText: text(value), confidence: .85 };
          skills[index] = { ...skills[index], evidence: [...skills[index].evidence, evidence] };
          assertionChanges.push({ conceptId, assertionType: "EVIDENCE_DERIVED", proficiency: Number(skills[index].level ?? 3), confidence: .85, evidence: [evidence] as Prisma.InputJsonValue });
        } else if (index >= 0 && question.field.startsWith("skill_years:")) skills[index] = { ...skills[index], years: Math.max(0, number(value)) };
        else if (index >= 0 && question.field.startsWith("skill_level:")) skills[index] = { ...skills[index], level: Math.max(1, Math.min(5, Math.round(number(value)))) };
      } else if (question.field.startsWith("project_detail:")) projects.push({ name: "Bổ sung từ AI làm rõ", description: text(value), source: "candidate_clarification" });
      else if (question.field.startsWith("experience_detail:")) experiences.push({ company: "Bổ sung từ AI làm rõ", title: "Chi tiết kinh nghiệm", description: text(value), source: "candidate_clarification" });
    }
    const nextVersion = profile.profileVersion + 1;
    const answeredIds = input.answers.map((item) => item.questionId);
    const updated = await db.$transaction(async (transaction) => {
      await transaction.profileRevision.create({ data: { candidateProfileId: profile.id, version: profile.profileVersion, source: "AI_CLARIFICATION", snapshot: profileSnapshot(profile) } });
      for (const answer of input.answers) {
        await transaction.candidateClarificationAnswer.create({ data: { questionId: answer.questionId, value: (answer.value ?? "") as Prisma.InputJsonValue, skipped: answer.skipped, profileChanges: { field: byId.get(answer.questionId)!.field } } });
        await transaction.candidateClarificationQuestion.update({ where: { id: answer.questionId }, data: { status: answer.skipped ? "SKIPPED" : "ANSWERED" } });
      }
      await transaction.candidateClarificationQuestion.updateMany({ where: { candidateProfileId: profile.id, profileVersion: profile.profileVersion, status: "PENDING", id: { notIn: answeredIds } }, data: { status: "INVALIDATED" } });
      for (const change of assertionChanges) {
        await transaction.candidateConceptAssertion.updateMany({ where: { candidateProfileId: profile.id, taxonomyLabelId: change.conceptId, active: true }, data: { active: false } });
        await transaction.candidateConceptAssertion.create({ data: { candidateProfileId: profile.id, taxonomyLabelId: change.conceptId, assertionType: change.assertionType, proficiency: change.proficiency, confidence: change.confidence, evidence: change.evidence, sourceVersion: nextVersion } });
      }
      const data = { occupation, skills: skills as Prisma.InputJsonValue, projects: projects as Prisma.InputJsonValue, experiences: experiences as Prisma.InputJsonValue, availabilityHours, hourlyRate, workModes: workModes as Prisma.InputJsonValue, profileVersion: nextVersion, verified: true, completeness: Math.min(1, profile.completeness + input.answers.filter((item) => !item.skipped).length * .03), evidenceQuality: Math.min(1, profile.evidenceQuality + assertionChanges.filter((item) => item.assertionType === "EVIDENCE_DERIVED").length * .04) };
      return transaction.candidateProfile.update({ where: { id: profile.id }, data: { ...data, searchDocument: candidateSearchDocument({ ...profile, ...data }) } });
    });
    await enqueueRecompute(profile.id, nextVersion);
    return NextResponse.json({ data: { profile: updated, questions: [], done: true }, errors: [], requestId: crypto.randomUUID() });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "CANDIDATE_CLARIFICATION_ANSWER_FAILED", message: error instanceof Error ? error.message : String(error) }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
