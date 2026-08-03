import { db } from "@/lib/db";
import { candidateFromDb, jobFromDb } from "@/lib/db-mappers";
import { matchCandidate } from "@/lib/matching";
import { loadTaxonomyGraph, type TaxonomyGraph } from "@/lib/taxonomy/graph";
import type { Candidate, Job, Skill } from "@/lib/types";

type GapType = "missing_skill" | "proficiency_gap" | "evidence_gap" | "transferable_skill";

function relevantOccupation(candidate: Candidate, job: Job, graph: TaxonomyGraph) {
  if (!candidate.occupation || candidate.occupation === "unknown") return false;
  if (candidate.occupation === job.occupation) return true;
  const similarity = graph.occupationSimilarity(candidate.occupation, job.occupation);
  return Boolean(similarity && similarity.strength >= .55 && similarity.kind !== "shared_ancestor");
}

function upgradedCandidate(candidate: Candidate, skillId: string, label: string, type: GapType, requiredLevel: number): Candidate {
  const existing = candidate.skills.find((skill) => skill.id === skillId);
  if (!existing) return { ...candidate, skills: [...candidate.skills, { id: skillId, label, level: Math.max(3, requiredLevel), years: 0, evidence: [{ sourceType: "project", sourceText: `Counterfactual evidence for ${label}`, confidence: .9 }] }] };
  const replacement: Skill = type === "evidence_gap"
    ? { ...existing, evidence: [...existing.evidence, { sourceType: "project", sourceText: `Counterfactual evidence for ${label}`, confidence: .9 }] }
    : { ...existing, level: Math.max(existing.level, requiredLevel), effectiveLevel: Math.max(existing.effectiveLevel ?? existing.level, requiredLevel) };
  return { ...candidate, skills: candidate.skills.map((skill) => skill.id === skillId ? replacement : skill) };
}

export function buildCareerRoadmapFromData(candidate: Candidate, jobs: Job[], graph: TaxonomyGraph) {
  const relevantJobs = jobs.filter((job) => relevantOccupation(candidate, job, graph));
  const ranked = relevantJobs.map((job) => ({ job, result: matchCandidate(job, candidate, graph) }))
    .sort((left, right) => Number(right.result.eligible) - Number(left.result.eligible) || right.result.score - left.result.score)
    .slice(0, 12);
  const currentScore = ranked.length ? ranked.reduce((sum, item) => sum + item.result.score, 0) / ranked.length : 0;
  const skills = new Map(candidate.skills.map((skill) => [skill.id, skill]));
  const gapMap = new Map<string, { skillId: string; skill: string; type: GapType; requiredLevel: number; jobs: typeof ranked; relatedSkill: string | null; taxonomyPath: string[] }>();

  for (const item of ranked) for (const required of item.job.requiredSkills) {
    const owned = skills.get(required.id);
    let type: GapType | null = null;
    let relatedSkill: string | null = null;
    let taxonomyPath: string[] = [];
    if (owned) {
      const evidenceConfidence = owned.evidence.length ? Math.max(...owned.evidence.map((evidence) => evidence.confidence)) : 0;
      if (!owned.evidence.length || evidenceConfidence < .65) type = "evidence_gap";
      else if ((owned.effectiveLevel ?? owned.level) < required.level) type = "proficiency_gap";
    } else {
      const related = candidate.skills.map((skill) => ({ skill, match: graph.hierarchyMatch(skill.id, required.id) })).filter((entry) => entry.match).sort((left, right) => right.match!.strength - left.match!.strength)[0];
      if (related?.match && related.match.strength >= .5) { type = "transferable_skill"; relatedSkill = related.skill.label; taxonomyPath = related.match.labels; }
      else type = "missing_skill";
    }
    if (!type) continue;
    const key = `${required.id}:${type}`;
    const gap = gapMap.get(key) ?? { skillId: required.id, skill: required.label, type, requiredLevel: required.level, jobs: [], relatedSkill, taxonomyPath };
    gap.requiredLevel = Math.max(gap.requiredLevel, required.level);
    gap.jobs.push(item);
    gapMap.set(key, gap);
  }

  const gaps = [...gapMap.values()].map((gap) => {
    const upgraded = upgradedCandidate(candidate, gap.skillId, gap.skill, gap.type, gap.requiredLevel);
    const impacts = gap.jobs.map(({ job, result }) => Math.max(0, matchCandidate(job, upgraded, graph).score - result.score));
    const estimatedImpact = impacts.length ? impacts.reduce((sum, value) => sum + value, 0) / impacts.length : 0;
    return { skillId: gap.skillId, skill: gap.skill, type: gap.type, requiredLevel: gap.requiredLevel, relatedSkill: gap.relatedSkill, taxonomyPath: gap.taxonomyPath, jobCount: gap.jobs.length, jobFrequency: gap.jobs.length / Math.max(1, ranked.length), impactedJobs: gap.jobs.map((item) => item.job.id), estimatedImpact: Math.round(estimatedImpact * 10) / 10 };
  }).filter((gap) => gap.estimatedImpact > 0).sort((left, right) => right.estimatedImpact - left.estimatedImpact || right.jobFrequency - left.jobFrequency).slice(0, 8);

  const strengths = candidate.skills.slice().sort((left, right) => (right.effectiveLevel ?? right.level) - (left.effectiveLevel ?? left.level) || right.evidence.length - left.evidence.length).slice(0, 6).map((skill) => ({ skillId: skill.id, skill: skill.label, level: skill.effectiveLevel ?? skill.level, years: skill.years, evidenceCount: skill.evidence.length, evidence: skill.evidence.slice(0, 3).map((item) => item.sourceText), confidence: skill.evidence.length ? Math.max(...skill.evidence.map((item) => item.confidence)) : .35 }));
  const steps = gaps.slice(0, 5).map((gap, index) => ({ priority: index + 1, skill: gap.skill, skillId: gap.skillId, gapType: gap.type, estimatedImpact: gap.estimatedImpact, frequency: gap.jobFrequency, impactedJobs: gap.impactedJobs, reason: `${gap.skill} xuất hiện trong ${gap.jobCount}/${Math.max(1, ranked.length)} việc đúng nghề; khoảng trống loại ${gap.type}.`, practiceAction: `Tạo một sản phẩm thực tế chứng minh ${gap.skill} ở mức ${gap.requiredLevel}.`, evidenceToAdd: `Bổ sung vai trò, cách áp dụng, kết quả đo được và liên kết sản phẩm sử dụng ${gap.skill}.`, taxonomyPath: gap.taxonomyPath }));
  const projectedScore = Math.min(100, currentScore + gaps.slice(0, 3).reduce((sum, gap) => sum + gap.estimatedImpact, 0));
  return { target: candidate.occupation, occupation: candidate.occupation, currentLevel: candidate.experienceYears >= 5 ? "senior" : candidate.experienceYears >= 2 ? "middle" : candidate.experienceYears > 0 ? "junior" : "entry", currentScore: Math.round(currentScore), projectedScore: Math.round(projectedScore), evaluatedJobs: ranked.length, strengths, gaps, steps, phases: steps.map((step, index) => ({ order: index + 1, title: `Nâng năng lực ${step.skill}`, goal: step.reason, skills: [step.skill], actions: [step.practiceAction], deliverable: `Sản phẩm hoặc case study sử dụng ${step.skill}`, evidence: step.evidenceToAdd, completionCriteria: [`Có sản phẩm chạy được`, `Mô tả rõ vai trò và kết quả`, `Có evidence kiểm chứng`], expectedImpact: step.estimatedImpact })) };
}

export async function buildCareerRoadmap(candidateProfileId: string) {
  const [profile, records, graph] = await Promise.all([
    db.candidateProfile.findUniqueOrThrow({ where: { id: candidateProfileId }, include: { user: true } }),
    db.job.findMany({ where: { published: true } }),
    loadTaxonomyGraph(),
  ]);
  return buildCareerRoadmapFromData(candidateFromDb(profile), records.map(jobFromDb), graph);
}
