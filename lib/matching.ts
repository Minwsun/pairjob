import type { Candidate, FitStatus, Job, MatchResult, Skill } from "./types";
import { loadTaxonomyGraph, TaxonomyGraph } from "@/lib/taxonomy/graph";
import { effectiveSkillLevel } from "@/lib/proficiency";
import { fitStatusFromEvidence, fitStatusFromScore } from "@/lib/match-status";
import { formatCompensation } from "@/lib/compensation";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const clamp100 = (value: number) => Math.max(0, Math.min(100, value));

function creditedStrength(match: NonNullable<ReturnType<TaxonomyGraph["hierarchyMatch"]>>) {
  if (match.kind === "exact") return 1;
  if (match.kind === "equivalent") return Math.min(.95, match.strength);
  if (match.kind === "descendant") return Math.min(.92, match.strength);
  if (match.kind === "transferable") return Math.min(.72, Math.max(.5, match.strength));
  if (match.kind === "ancestor") return Math.min(.58, Math.max(.4, match.strength));
  return Math.min(.42, Math.max(.25, match.strength));
}

function bestSkillMatch(requiredId: string, skills: Skill[], graph: TaxonomyGraph) {
  return skills.slice().sort((left, right) => effectiveSkillLevel(right) - effectiveSkillLevel(left) || right.evidence.length - left.evidence.length).slice(0, 50)
    .map((skill) => ({ skill, path: graph.hierarchyMatch(skill.id, requiredId) })).filter((item) => item.path)
    .sort((left, right) => right.path!.strength - left.path!.strength)[0] ?? null;
}

function assignRequiredSkills(job: Job, candidate: Candidate, graph: TaxonomyGraph) {
  const candidates = job.requiredSkills.map((required) => ({
    required,
    options: candidate.skills
      .map((skill) => ({ skill, path: graph.hierarchyMatch(skill.id, required.id) }))
      .filter((item): item is { skill: Skill; path: NonNullable<ReturnType<TaxonomyGraph["hierarchyMatch"]>> } => Boolean(item.path))
      .sort((left, right) => creditedStrength(right.path) - creditedStrength(left.path) || effectiveSkillLevel(right.skill) - effectiveSkillLevel(left.skill))
      .slice(0, 5),
  })).sort((left, right) => left.options.length - right.options.length);
  let bestScore = -1;
  let best: { required: Job["requiredSkills"][number]; match: { skill: Skill; path: NonNullable<ReturnType<TaxonomyGraph["hierarchyMatch"]>> } | null }[] = [];
  const visit = (index: number, used: Set<string>, score: number, selected: typeof best) => {
    if (index === candidates.length) { if (score > bestScore) { bestScore = score; best = [...selected]; } return; }
    const item = candidates[index];
    visit(index + 1, used, score, [...selected, { required: item.required, match: null }]);
    for (const option of item.options) {
      if (used.has(option.skill.id)) continue;
      used.add(option.skill.id);
      visit(index + 1, used, score + creditedStrength(option.path), [...selected, { required: item.required, match: option }]);
      used.delete(option.skill.id);
    }
  };
  visit(0, new Set(), 0, []);
  const byRequirement = new Map(best.map((item) => [item.required.id, item.match]));
  return job.requiredSkills.map((required) => ({ required, match: byRequirement.get(required.id) ?? null }));
}

function weightedBreakdown(features: { key: string; value: number; weight: number; applicable: boolean }[]) {
  const active = features.filter((feature) => feature.applicable);
  const totalWeight = active.reduce((sum, feature) => sum + feature.weight, 0) || 1;
  return Object.fromEntries(active.map((feature) => [feature.key, clamp(feature.value) * feature.weight / totalWeight * 100]));
}

function dynamicWeights(job: Job, candidate: Candidate) {
  const weights = { requiredSkills: 38, occupation: 20, proficiency: 10, experience: 8, domain: 9, preferredSkills: 5, evidence: 10 };
  if (!job.requiredSkills.length) { weights.requiredSkills = 0; weights.proficiency = 0; weights.occupation += 18; weights.domain += 8; weights.evidence += 4; }
  else if (job.requiredSkills.length <= 2) { weights.requiredSkills -= 8; weights.occupation += 5; weights.domain += 3; }
  if (job.experienceMin <= 1) { weights.experience = 3; weights.evidence += 3; weights.occupation += 2; }
  if (!job.domains.length) { weights.occupation += Math.round(weights.domain / 2); weights.evidence += weights.domain - Math.round(weights.domain / 2); weights.domain = 0; }
  if (!job.preferredSkills.length) { weights.requiredSkills += weights.preferredSkills; weights.preferredSkills = 0; }
  if (candidate.evidenceQuality < .45) { weights.evidence += 4; weights.occupation = Math.max(8, weights.occupation - 2); weights.proficiency = Math.max(6, weights.proficiency - 2); }
  return weights;
}

export function matchCandidate(job: Job, candidate: Candidate, graph?: TaxonomyGraph): MatchResult {
  if (!graph) {
    const skills = new Map(candidate.skills.map((skill) => [skill.id, skill]));
    const exact = job.requiredSkills.filter((required) => skills.has(required.id));
    const requiredCoverage = job.requiredSkills.length ? exact.length / job.requiredSkills.length : 1;
    const treeCompatibility = candidate.occupation === job.occupation ? 1 : 0;
    const score = Math.round(requiredCoverage * 60 + treeCompatibility * 20 + candidate.evidenceQuality * 10 + clamp(candidate.experienceYears / Math.max(1, job.experienceMin)) * 10);
    const fitStatus = fitStatusFromScore(score);
    return { candidate, score, deterministicScore: score, confidence: Math.round(candidate.evidenceQuality * 100), eligible: fitStatus === "qualified", fitStatus, requiredCoverage, treeCompatibility, reasons: [], breakdown: { requiredSkills: requiredCoverage * 60 }, exactMatches: exact.map((item) => item.label), relatedMatches: [], missingRequirements: job.requiredSkills.filter((item) => !skills.has(item.id)).map((item) => item.label), skillGaps: job.requiredSkills.filter((item) => !skills.has(item.id)).map((item) => item.label), taxonomyPaths: [] };
  }

  const requiredMatches = assignRequiredSkills(job, candidate, graph);
  const requiredCoverage = job.requiredSkills.length ? requiredMatches.reduce((sum, item) => sum + (item.match ? creditedStrength(item.match.path) : 0), 0) / job.requiredSkills.length : 1;
  const directCoverage = job.requiredSkills.length ? requiredMatches.reduce((sum, item) => sum + (item.match && ["exact", "equivalent", "descendant"].includes(item.match.path.kind) ? creditedStrength(item.match.path) : 0), 0) / job.requiredSkills.length : 1;
  const inferredCoverage = Math.max(0, requiredCoverage - directCoverage);
  const proficiency = job.requiredSkills.length ? requiredMatches.reduce((sum, item) => sum + (item.match ? creditedStrength(item.match.path) * clamp(effectiveSkillLevel(item.match.skill) / Math.max(1, item.required.level)) : 0), 0) / job.requiredSkills.length : 1;
  const experience = job.experienceMin > 0 ? clamp(candidate.experienceYears / job.experienceMin) : 1;
  const domain = job.domains.length ? job.domains.reduce((sum, required) => sum + candidate.domains.reduce((best, value) => Math.max(best, graph.hierarchyMatch(value, required)?.strength ?? 0), 0), 0) / job.domains.length : 0;
  const occupationPath = graph.occupationSimilarity(candidate.occupation, job.occupation);
  const contextualOccupation = Math.min(.75, requiredCoverage * .52 + domain * .23);
  const treeCompatibility = Math.max(occupationPath?.strength ?? 0, contextualOccupation);
  const occupationSimilarityMethod = occupationPath?.method ?? (contextualOccupation > 0 ? "skill_domain_fallback" : "none");
  const preferred = job.preferredSkills.length ? job.preferredSkills.reduce((sum, item) => sum + (bestSkillMatch(item.id, candidate.skills, graph)?.path?.strength ?? 0), 0) / job.preferredSkills.length : 0;
  const workMode = !job.workMode || job.workMode === "flexible" ? 1 : candidate.workModes.length === 0 ? .5 : candidate.workModes.includes(job.workMode) ? 1 : 0;
  const evidence = clamp(candidate.evidenceQuality);
  const educationRequirements = job.educationRequirements ?? [];
  const candidateEducationIds = (candidate.education ?? []).flatMap((item) => [item.degreeLevelId, item.fieldOfStudyId]).filter(Boolean) as string[];
  const educationMatches = educationRequirements.map((requirement) => ({ requirement, strength: candidateEducationIds.reduce((best, id) => Math.max(best, graph.hierarchyMatch(id, requirement.id)?.strength ?? 0), 0) }));
  const missingRequiredEducation = educationMatches.filter((item) => item.requirement.requirementType === "required" && item.strength < .35);
  const softBlockers = [
    candidate.workModes.length > 0 && workMode === 0 && "Không hỗ trợ chế độ làm việc bắt buộc",
    job.availabilityMin > 0 && candidate.availability !== null && candidate.availability < job.availabilityMin && `Chỉ có ${candidate.availability}/${job.availabilityMin} giờ mỗi tuần`,
    job.budgetMax > 0 && (candidate.compensation?.period ?? "HOUR") === (job.compensation?.period ?? "HOUR") && candidate.rate !== null && candidate.rate > job.budgetMax && `Mức mong muốn ${formatCompensation(candidate.rate, candidate.compensation?.period ?? "HOUR")} vượt ngân sách ${formatCompensation(job.budgetMax, job.compensation?.period ?? "HOUR")}`,
  ].filter(Boolean) as string[];
  const hardBlockers = missingRequiredEducation.map((item) => `Thiếu bằng cấp/ngành học bắt buộc: ${item.requirement.label}`);
  const blockers = [...hardBlockers, ...softBlockers];
  const weights = dynamicWeights(job, candidate);
  const breakdown = weightedBreakdown([
    { key: "requiredSkills", value: requiredCoverage, weight: weights.requiredSkills, applicable: weights.requiredSkills > 0 },
    { key: "occupation", value: treeCompatibility, weight: weights.occupation, applicable: Boolean(job.occupation) },
    { key: "proficiency", value: proficiency, weight: weights.proficiency, applicable: job.requiredSkills.length > 0 },
    { key: "experience", value: experience, weight: weights.experience, applicable: job.experienceMin > 0 },
    { key: "domain", value: domain, weight: weights.domain, applicable: job.domains.length > 0 },
    { key: "preferredSkills", value: preferred, weight: weights.preferredSkills, applicable: job.preferredSkills.length > 0 },
    { key: "evidence", value: evidence, weight: weights.evidence, applicable: true },
  ]);
  const rawScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const semanticSupport = Math.max(requiredCoverage, treeCompatibility, domain);
  const occupationFloor = occupationSimilarityMethod === "shared_branch" ? 58 : occupationSimilarityMethod === "shared_family" ? 40 : occupationSimilarityMethod === "shared_sector" ? 30 : 0;
  const score = Math.max(occupationFloor, Math.round(clamp100(rawScore + (100 - rawScore) * .08 * semanticSupport)));
  const hierarchicalMatches = requiredMatches.filter((item) => item.match).map((item) => ({ requirementId: item.required.id, requirement: item.required.label, candidateSkillId: item.match!.skill.id, candidateSkill: item.match!.skill.label, strength: item.match!.path!.strength, contribution: creditedStrength(item.match!.path!), kind: item.match!.path!.kind, pathIds: item.match!.path!.labelIds, path: item.match!.path!.labels }));
  const exactMatches = hierarchicalMatches.filter((item) => item.kind === "exact").map((item) => item.requirement);
  const relatedMatches = hierarchicalMatches.filter((item) => item.kind !== "exact").map(({ requirement, candidateSkill, strength, path }) => ({ requirement, candidateSkill, strength, path }));
  const requiredSkillAssessments = requiredMatches.map((item) => {
    const contribution = item.match ? creditedStrength(item.match.path) : 0;
    const evidenceConfidence = item.match ? item.match.skill.evidence.reduce((best, current) => Math.max(best, current.confidence), 0) : 0;
    const relation: "direct" | "semantic_equivalent" | "transferable" | "related" | "missing" = !item.match ? "missing" : item.match.path.kind === "exact" ? "direct" : ["equivalent", "descendant"].includes(item.match.path.kind) && contribution >= .7 ? "semantic_equivalent" : ["ancestor", "transferable"].includes(item.match.path.kind) ? "transferable" : "related";
    const supportedTransfer = relation === "transferable" && contribution >= .5 && evidenceConfidence >= .55;
    const critical = item.required.level >= 4 && !(relation === "direct" || (relation === "semantic_equivalent" && evidenceConfidence >= .4) || supportedTransfer);
    const status: FitStatus = relation === "direct" || (relation === "semantic_equivalent" && evidenceConfidence >= .4) || supportedTransfer ? "qualified" : contribution >= .25 ? "skill_gap" : "not_fit";
    return { requirementId: item.required.id, requirement: item.required.label, candidateSkill: item.match?.skill.label ?? null, relation, contribution, evidenceConfidence, critical, status, path: item.match?.path.labels ?? [] };
  });
  const rawCriticalGapCount = requiredSkillAssessments.filter((item) => item.critical).length;
  const branchEquivalent = occupationSimilarityMethod === "shared_branch" && requiredCoverage >= .25;
  const criticalGapCount = branchEquivalent ? 0 : rawCriticalGapCount;
  const semanticCoverage = job.requiredSkills.length ? requiredSkillAssessments.reduce((sum, item) => sum + (item.status === "qualified" ? 1 : item.status === "skill_gap" ? .6 : 0), 0) / job.requiredSkills.length : 1;
  const semanticEquivalent = branchEquivalent || requiredSkillAssessments.some((item) => ["semantic_equivalent", "transferable"].includes(item.relation) && item.status === "qualified");
  const fitStatus = fitStatusFromEvidence(score, hardBlockers, criticalGapCount, semanticEquivalent, softBlockers);
  const skillGaps = requiredSkillAssessments.filter((item) => item.status !== "qualified").map((item) => item.requirement);
  const candidateTrees = graph.topTrees([candidate.occupation, ...candidate.skills.map((skill) => skill.id), ...candidate.domains], Object.fromEntries(candidate.skills.map((skill) => [skill.id, Math.max(1, skill.level)])));
  const jobTrees = graph.topTrees([job.occupation, ...job.requiredSkills.map((skill) => skill.id), ...job.domains], Object.fromEntries(job.requiredSkills.map((skill) => [skill.id, 5])));
  const taxonomyPaths = [...hierarchicalMatches.map((item) => item.path), ...(occupationPath ? [occupationPath.labels] : [])];
  const reasons = [
    `Độ phủ kỹ năng bắt buộc ${Math.round(requiredCoverage * 100)}%`,
    hierarchicalMatches.length ? `Quan hệ taxonomy: ${hierarchicalMatches.map((item) => `${item.candidateSkill} → ${item.requirement} (${item.kind})`).join(", ")}` : "Không có kỹ năng liên quan đủ mạnh",
    skillGaps.length ? `Khoảng trống kỹ năng: ${skillGaps.join(", ")}` : "Đủ kỹ năng bắt buộc",
    ...blockers,
  ];
  const confidence = Math.round(clamp(evidence * .7 + requiredCoverage * .3) * 100);
  const evidenceCoverage = job.requiredSkills.length ? requiredMatches.reduce((sum, item) => sum + (item.match ? clamp(item.match.skill.evidence.reduce((best, current) => Math.max(best, current.confidence), 0)) : 0), 0) / job.requiredSkills.length : evidence;
  const transferableContribution = Math.min(10, inferredCoverage * 50);
  return { candidate, score, deterministicScore: score, aiRerankDelta: 0, confidence, eligible: blockers.length === 0 && fitStatus !== "not_fit", fitStatus, requiredCoverage, directCoverage, inferredCoverage, transferableContribution, evidenceCoverage, semanticCoverage, criticalGapCount, statusReason: fitStatus === "qualified" ? "Năng lực trực tiếp hoặc tương đương có bằng chứng." : fitStatus === "skill_gap" ? softBlockers[0] ?? "Có nền tảng phù hợp nhưng còn thiếu kỹ năng quan trọng." : blockers[0] ?? "Mức tương thích còn thấp.", requiredSkillAssessments, treeCompatibility, occupationSimilarity: treeCompatibility, occupationSimilarityMethod, occupationSharedConcepts: occupationPath?.sharedConcepts ?? [], hardConstraintViolations: hardBlockers, softConstraintViolations: softBlockers, dynamicWeights: weights, reasons, breakdown, exactMatches, relatedMatches, missingRequirements: skillGaps, skillGaps, taxonomyPaths, hierarchicalMatches, candidateTrees, jobTrees };
}

export async function reviewSemanticMatch(job: Job, candidate: Candidate, graph: TaxonomyGraph, deterministic = matchCandidate(job, candidate, graph)): Promise<MatchResult> {
  try {
    const [{ generateStructured }, { semanticMatchSchema }, { systemPrompts }] = await Promise.all([
      import("@/lib/ai/client"),
      import("@/lib/ai/schemas"),
      import("@/lib/prompts"),
    ]);
    const ai = await generateStructured(systemPrompts.semanticRerank, { job, candidate, deterministic_result: deterministic }, semanticMatchSchema, "fast");
    const evidenceIsSupported = ai.supported_evidence.length > 0 && ai.evidence_support >= .35;
    const delta = Math.max(-8, Math.min(8, evidenceIsSupported || ai.rerank_delta <= 0 ? ai.rerank_delta : 0));
    const score = Math.round(clamp100(deterministic.score + delta));
    const blockers = deterministic.hardConstraintViolations ?? [];
    const softBlockers = deterministic.softConstraintViolations ?? [];
    const strongSemanticEquivalent = evidenceIsSupported && ai.task_similarity >= .8 && ai.occupation_semantic_score >= .65 && ai.evidence_support >= .55;
    const criticalGapCount = strongSemanticEquivalent ? 0 : deterministic.criticalGapCount ?? 0;
    const fitStatus = fitStatusFromEvidence(score, blockers, criticalGapCount, strongSemanticEquivalent, softBlockers);
    return { ...deterministic, score, fitStatus, eligible: deterministic.eligible && fitStatus !== "not_fit", criticalGapCount, statusReason: fitStatus === "qualified" && strongSemanticEquivalent ? "AI xác nhận năng lực tương đương sâu bằng evidence trong CV." : deterministic.statusReason, aiRerankDelta: delta, confidence: Math.round(clamp100(deterministic.confidence + ai.confidence_delta)), semanticReview: { occupationSemanticScore: ai.occupation_semantic_score, taskSimilarity: ai.task_similarity, transferableSkillScore: ai.transferable_skill_score, projectDomainSimilarity: ai.project_domain_similarity, evidenceSupport: ai.evidence_support, supportedEvidence: ai.supported_evidence, rejectedAssumptions: ai.rejected_assumptions }, reasons: [...deterministic.reasons, ...ai.reasons, ...ai.warnings] };
  } catch { return deterministic; }
}

export async function rankCandidatesSemantic(job: Job, list: Candidate[]) {
  const graph = await loadTaxonomyGraph(); const results: MatchResult[] = [];
  for (let index = 0; index < list.length; index += 4) results.push(...await Promise.all(list.slice(index, index + 4).map((candidate) => reviewSemanticMatch(job, candidate, graph))));
  return results.sort((left, right) => ["not_fit", "skill_gap", "qualified"].indexOf(right.fitStatus) - ["not_fit", "skill_gap", "qualified"].indexOf(left.fitStatus) || right.score - left.score);
}

export async function recommendJobsSemantic(candidate: Candidate, jobs: Job[]) {
  const graph = await loadTaxonomyGraph(); const ranked: { job: Job; result: MatchResult }[] = [];
  for (let index = 0; index < jobs.length; index += 4) ranked.push(...await Promise.all(jobs.slice(index, index + 4).map(async (job) => ({ job, result: await reviewSemanticMatch(job, candidate, graph) }))));
  return ranked.sort((left, right) => ["not_fit", "skill_gap", "qualified"].indexOf(right.result.fitStatus) - ["not_fit", "skill_gap", "qualified"].indexOf(left.result.fitStatus) || right.result.score - left.result.score);
}
