import { db } from "@/lib/db";
import { candidateFromDb, jobFromDb } from "@/lib/db-mappers";
import { matchCandidate, reviewSemanticMatch } from "@/lib/matching";
import { retrieveCandidates, retrieveJobs, type RetrievalSignal } from "@/lib/recommendation-retrieval";
import type { Candidate, Job, MatchResult } from "@/lib/types";
import { loadTaxonomyGraph } from "@/lib/taxonomy/graph";
import { recommendationVersions } from "@/lib/versions";
import { activeRankingPolicy, scoreWithPolicy } from "@/lib/ranking-policy";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

const clamp100 = (value: number) => Math.max(0, Math.min(100, value));
const asArray = <T>(value: unknown) => Array.isArray(value) ? value as T[] : [];
const preferenceScore = (inferred: Record<string, number>, keys: string[]) => keys.length ? clamp100(50 + Math.max(...keys.map((key) => inferred[key] ?? 0), 0) * 10) : 50;
const signalText = (signals: RetrievalSignal[]) => signals.map((signal) => `${signal.channel}:rank=${signal.rank},score=${signal.score.toFixed(3)}`);

type Ranked<T> = T & { result: MatchResult; baseScore: number; diversityTokens: string[] };

function similarity(left: string[], right: string[]) { const a = new Set(left); const b = new Set(right); const shared = [...a].filter((token) => b.has(token)).length; return shared / Math.max(1, a.size + b.size - shared); }

function mmr<T extends { baseScore: number; diversityTokens: string[] }>(items: T[], lambda = .82) {
  const selected: (T & { recommendationScore: number; diversityContribution: number })[] = [];
  const remaining = [...items];
  while (remaining.length) {
    let bestIndex = 0; let best = -Infinity; let diversity = 100;
    const bestBase = Math.max(...remaining.map((item) => item.baseScore));
    for (let index = 0; index < remaining.length; index++) {
      if (remaining[index].baseScore < bestBase - 10) continue;
      const maximumSimilarity = selected.reduce((maximum, item) => Math.max(maximum, similarity(item.diversityTokens, remaining[index].diversityTokens)), 0);
      const novelty = 100 * (1 - maximumSimilarity);
      const score = lambda * remaining[index].baseScore + (1 - lambda) * novelty;
      if (score > best) { best = score; bestIndex = index; diversity = novelty; }
    }
    const [item] = remaining.splice(bestIndex, 1);
    selected.push({ ...item, recommendationScore: clamp100(best), diversityContribution: diversity });
  }
  return selected;
}

function category(result: MatchResult) {
  if (result.fitStatus === "not_fit") return "not_fit";
  if (result.fitStatus === "skill_gap") return "skill_gap";
  if (result.score >= 80) return "best_match";
  if (result.score >= 58) return "potential_match";
  return "stretch_match";
}

const candidateSummary = (item: Ranked<{ candidate: Candidate }> & { recommendationScore: number; diversityContribution: number }, signals: RetrievalSignal[]) => ({
  candidate: { id: item.candidate.id, name: item.candidate.name, title: item.candidate.title, occupation: item.candidate.occupation, skills: item.candidate.skills.slice(0, 5), experienceYears: item.candidate.experienceYears, workModes: item.candidate.workModes, evidenceQuality: item.candidate.evidenceQuality },
  matchScore: item.result.score, recommendationScore: item.recommendationScore, confidence: item.result.confidence, eligible: item.result.eligible, fitStatus: item.result.fitStatus, category: category(item.result), reasons: item.result.reasons.slice(0, 2), retrievalSignals: signals,
});

const jobSummary = (item: Ranked<{ job: Job }> & { recommendationScore: number; diversityContribution: number }, signals: RetrievalSignal[]) => ({
  job: { id: item.job.id, title: item.job.title, company: item.job.company, occupation: item.job.occupation, requiredSkills: item.job.requiredSkills.slice(0, 5), domains: item.job.domains, workMode: item.job.workMode, compensation: item.job.compensation, deadlineText: item.job.deadlineText },
  matchScore: item.result.score, recommendationScore: item.recommendationScore, confidence: item.result.confidence, eligible: item.result.eligible, fitStatus: item.result.fitStatus, category: category(item.result), reasons: item.result.reasons.slice(0, 2), retrievalSignals: signals,
});

export function compareCandidateJobRank(left: { baseScore: number; result: MatchResult }, right: { baseScore: number; result: MatchResult }) {
  return right.baseScore - left.baseScore || right.result.score - left.result.score || Number(right.result.eligible) - Number(left.result.eligible);
}

async function taxonomyVersion() {
  const [label, edges] = await Promise.all([db.taxonomyLabel.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }), db.taxonomyEdge.count()]);
  return `${label?.updatedAt.toISOString() ?? "empty"}:${edges}`;
}

const recommendationCacheKey = (parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex");
const cachePayload = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function cachedRecommendation(cacheKey: string) {
  const session = await db.recommendationSession.findUnique({ where: { cacheKey }, select: { id: true, resultPayload: true, createdAt: true, staleAt: true, expiresAt: true } });
  if (!session?.resultPayload || session.expiresAt && session.expiresAt <= new Date()) return null;
  return { sessionId: session.id, ...(session.resultPayload as object), cacheStatus: session.staleAt && session.staleAt <= new Date() ? "stale" : "fresh", computedAt: session.createdAt } as any;
}

export async function recommendCandidates(jobId: string, reviewWithAi = false) {
  const [jobRecord, policy, taxonomy, candidateDataset] = await Promise.all([
    db.job.findUniqueOrThrow({ where: { id: jobId }, include: { owner: { include: { recommendationPreference: true } } } }),
    activeRankingPolicy("CANDIDATES_FOR_JOB"),
    taxonomyVersion(),
    db.candidateProfile.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const queryVersion = jobRecord.updatedAt.toISOString();
  const cacheKey = recommendationCacheKey(["CANDIDATES_FOR_JOB", jobId, queryVersion, candidateDataset?.updatedAt.toISOString() ?? "empty", taxonomy, policy.version, recommendationVersions.retrieval, recommendationVersions.reranker, recommendationVersions.prompt, String(reviewWithAi)]);
  const cached = await cachedRecommendation(cacheKey);
  if (cached) return cached;
  const [retrieval, graph] = await Promise.all([retrieveCandidates(jobId), loadTaxonomyGraph()]);
  const profiles = await db.candidateProfile.findMany({ where: { id: { in: retrieval.map((item) => item.id) } }, include: { user: true } });
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const retrievalById = new Map(retrieval.map((item) => [item.id, item]));
  const job = jobFromDb(jobRecord);
  const inferred = (jobRecord.owner.recommendationPreference?.inferred as Record<string, number> | null) ?? {};
  let ranked: Ranked<{ candidate: Candidate }>[] = retrieval.flatMap((retrieved) => {
    const profile = profileById.get(retrieved.id); if (!profile) return [];
    const candidate = candidateFromDb(profile); const result = matchCandidate(job, candidate, graph);
    const preference = preferenceScore(inferred, [candidate.occupation, ...candidate.domains]);
    const baseScore = scoreWithPolicy(policy.weights, { match: result.score, confidence: result.confidence, retrieval: retrieved.score, preference, evidence: candidate.evidenceQuality * 100 });
    return [{ candidate, result, baseScore, diversityTokens: [candidate.occupation, ...candidate.domains, ...candidate.skills.map((skill) => skill.id)] }];
  }).sort(compareCandidateJobRank);
  const reviewedCandidates = new Map<string, MatchResult>();
  const candidateReviewBatch = reviewWithAi ? ranked.slice(0, 20) : [];
  const reviewedCandidateResults = await Promise.all(candidateReviewBatch.map((item) => reviewSemanticMatch(job, item.candidate, graph, item.result)));
  reviewedCandidateResults.forEach((result, index) => reviewedCandidates.set(candidateReviewBatch[index].candidate.id, result));
  ranked = ranked.map((item) => {
    const result = reviewedCandidates.get(item.candidate.id) ?? item.result;
    const retrieved = retrievalById.get(item.candidate.id);
    const preference = preferenceScore(inferred, [item.candidate.occupation, ...item.candidate.domains]);
    const baseScore = scoreWithPolicy(policy.weights, { match: result.score, confidence: result.confidence, retrieval: retrieved?.score ?? 0, preference, evidence: item.candidate.evidenceQuality * 100 });
    return { ...item, result, baseScore };
  }).sort(compareCandidateJobRank);
  const reranked = mmr(ranked.slice(0, 50)).slice(0, 20);
  await db.$transaction([
    ...reranked.map((item) => db.matchResult.upsert({
      where: { jobId_candidateProfileId: { jobId, candidateProfileId: item.candidate.id } },
      update: {
        score: Math.round(item.result.score), confidence: Math.round(item.result.confidence), eligible: item.result.eligible,
        breakdown: { ...item.result.breakdown, fitStatus: item.result.fitStatus, requiredCoverage: item.result.requiredCoverage, semanticCoverage: item.result.semanticCoverage ?? item.result.requiredCoverage, treeCompatibility: item.result.treeCompatibility, missingRequirements: item.result.missingRequirements ?? [], skillGaps: item.result.skillGaps ?? [] },
        reasons: item.result.reasons,
      },
      create: {
        jobId, candidateProfileId: item.candidate.id, score: Math.round(item.result.score), confidence: Math.round(item.result.confidence), eligible: item.result.eligible,
        breakdown: { ...item.result.breakdown, fitStatus: item.result.fitStatus, requiredCoverage: item.result.requiredCoverage, semanticCoverage: item.result.semanticCoverage ?? item.result.requiredCoverage, treeCompatibility: item.result.treeCompatibility, missingRequirements: item.result.missingRequirements ?? [], skillGaps: item.result.skillGaps ?? [] },
        reasons: item.result.reasons,
      },
    })),
    db.matchResult.deleteMany({ where: { jobId, candidateProfileId: { notIn: reranked.map((item) => item.candidate.id) } } }),
  ]);
  const payload = { semanticReviewStatus: reviewWithAi ? "completed" : "deterministic", results: reranked.map((item) => candidateSummary(item, retrievalById.get(item.candidate.id)?.signals ?? [])) };
  let session;
  try { session = await db.recommendationSession.create({ data: { actorId: jobRecord.ownerId, kind: "CANDIDATES_FOR_JOB", queryEntityId: jobId, queryVersion, cacheKey, resultPayload: cachePayload(payload), retrievalVersion: recommendationVersions.retrieval, rankingVersion: policy.version, rerankerVersion: recommendationVersions.reranker, promptVersion: recommendationVersions.prompt, taxonomyVersion: taxonomy, staleAt: new Date(Date.now() + 6 * 60 * 60_000), expiresAt: new Date(Date.now() + 24 * 60 * 60_000), items: { create: reranked.map((item, index) => ({ candidateProfileId: item.candidate.id, retrievalScore: retrievalById.get(item.candidate.id)?.score ?? 0, matchScore: item.result.score, recommendationScore: item.recommendationScore, confidence: item.result.confidence, eligible: item.result.eligible, rankBefore: ranked.findIndex((rankedItem) => rankedItem.candidate.id === item.candidate.id) + 1, rankAfter: index + 1, diversityContribution: item.diversityContribution, reasons: [...item.result.reasons, `Nhóm: ${category(item.result)}`], matchedSignals: signalText(retrievalById.get(item.candidate.id)?.signals ?? []), taxonomyPaths: item.result.taxonomyPaths ?? [] })) } }, include: { items: true } }); }
  catch (error) { const existing = await cachedRecommendation(cacheKey); if (existing) return existing; throw error; }
  return { sessionId: session.id, ...payload, cacheStatus: "fresh", computedAt: session.createdAt };
}

export async function recommendJobs(candidateProfileId: string, reviewWithAi = false) {
  const [profile, policy, taxonomy, jobDataset] = await Promise.all([
    db.candidateProfile.findUniqueOrThrow({ where: { id: candidateProfileId }, include: { user: { include: { recommendationPreference: true } } } }),
    activeRankingPolicy("JOBS_FOR_CANDIDATE"),
    taxonomyVersion(),
    db.job.findFirst({ where: { published: true }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const queryVersion = String(profile.profileVersion);
  const cacheKey = recommendationCacheKey(["JOBS_FOR_CANDIDATE", candidateProfileId, queryVersion, jobDataset?.updatedAt.toISOString() ?? "empty", taxonomy, policy.version, recommendationVersions.retrieval, recommendationVersions.reranker, recommendationVersions.prompt, String(reviewWithAi)]);
  const cached = await cachedRecommendation(cacheKey);
  if (cached) return cached;
  const [retrieval, graph] = await Promise.all([retrieveJobs(candidateProfileId), loadTaxonomyGraph()]);
  const jobs = await db.job.findMany({ where: { id: { in: retrieval.map((item) => item.id) } } });
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const retrievalById = new Map(retrieval.map((item) => [item.id, item]));
  const candidate = candidateFromDb(profile); const inferred = (profile.user.recommendationPreference?.inferred as Record<string, number> | null) ?? {};
  let ranked: Ranked<{ job: Job }>[] = retrieval.flatMap((retrieved) => {
    const record = jobById.get(retrieved.id); if (!record) return [];
    const job = jobFromDb(record); const result = matchCandidate(job, candidate, graph);
    const preference = preferenceScore(inferred, [job.occupation, ...job.domains, job.workMode]);
    const availability = job.availabilityMin <= 0 || candidate.availability === null ? 50 : clamp100(candidate.availability / job.availabilityMin * 100);
    const baseScore = scoreWithPolicy(policy.weights, { match: result.score, preference, availability, freshness: job.freshness * 100, confidence: result.confidence, retrieval: retrieved.score });
    return [{ job, result, baseScore, diversityTokens: [job.occupation, ...job.domains, ...job.requiredSkills.map((skill) => skill.id)] }];
  }).sort(compareCandidateJobRank);
  const reviewedJobs = new Map<string, MatchResult>();
  const jobReviewBatch = reviewWithAi ? ranked.slice(0, 20) : [];
  const reviewedJobResults = await Promise.all(jobReviewBatch.map((item) => reviewSemanticMatch(item.job, candidate, graph, item.result)));
  reviewedJobResults.forEach((result, index) => reviewedJobs.set(jobReviewBatch[index].job.id, result));
  ranked = ranked.map((item) => {
    const result = reviewedJobs.get(item.job.id) ?? item.result;
    const retrieved = retrievalById.get(item.job.id);
    const preference = preferenceScore(inferred, [item.job.occupation, ...item.job.domains, item.job.workMode]);
    const availability = item.job.availabilityMin <= 0 || candidate.availability === null ? 50 : clamp100(candidate.availability / item.job.availabilityMin * 100);
    const baseScore = scoreWithPolicy(policy.weights, { match: result.score, preference, availability, freshness: item.job.freshness * 100, confidence: result.confidence, retrieval: retrieved?.score ?? 0 });
    return { ...item, result, baseScore };
  }).sort(compareCandidateJobRank);
  const reranked = mmr(ranked.slice(0, 50)).slice(0, 20);
  const payload = { semanticReviewStatus: reviewWithAi ? "completed" : "deterministic", results: reranked.map((item) => jobSummary(item, retrievalById.get(item.job.id)?.signals ?? [])) };
  let session;
  try { session = await db.recommendationSession.create({ data: { actorId: profile.userId, kind: "JOBS_FOR_CANDIDATE", queryEntityId: candidateProfileId, queryVersion, cacheKey, resultPayload: cachePayload(payload), retrievalVersion: recommendationVersions.retrieval, rankingVersion: policy.version, rerankerVersion: recommendationVersions.reranker, promptVersion: recommendationVersions.prompt, taxonomyVersion: taxonomy, staleAt: new Date(Date.now() + 6 * 60 * 60_000), expiresAt: new Date(Date.now() + 24 * 60 * 60_000), items: { create: reranked.map((item, index) => ({ jobId: item.job.id, candidateProfileId, retrievalScore: retrievalById.get(item.job.id)?.score ?? 0, matchScore: item.result.score, recommendationScore: item.recommendationScore, confidence: item.result.confidence, eligible: item.result.eligible, rankBefore: ranked.findIndex((rankedItem) => rankedItem.job.id === item.job.id) + 1, rankAfter: index + 1, diversityContribution: item.diversityContribution, reasons: [...item.result.reasons, `Nhóm: ${category(item.result)}`], matchedSignals: signalText(retrievalById.get(item.job.id)?.signals ?? []), taxonomyPaths: item.result.taxonomyPaths ?? [] })) } }, include: { items: true } }); }
  catch (error) { const existing = await cachedRecommendation(cacheKey); if (existing) return existing; throw error; }
  return { sessionId: session.id, ...payload, cacheStatus: "fresh", computedAt: session.createdAt };
}

export const recommendationEventStrength: Record<string, number> = { hired: 1, interviewed: .8, shortlisted: .6, applied: .6, saved: .35, viewed: .1, ignored: -.15, rejected: -.35 };

export async function recordRecommendationEvent(input: { actorId: string; sessionId?: string; eventType: string; targetJobId?: string; targetCandidateId?: string; position?: number }) {
  const strength = recommendationEventStrength[input.eventType]; if (strength === undefined) throw new Error("UNSUPPORTED_RECOMMENDATION_EVENT");
  const event = await db.recommendationEvent.create({ data: { ...input, strength } });
  const preference = await db.recommendationPreference.upsert({ where: { userId: input.actorId }, update: {}, create: { userId: input.actorId } });
  const inferred = { ...(preference.inferred as Record<string, number>) }; const keys: string[] = [];
  if (input.targetJobId) { const job = await db.job.findUnique({ where: { id: input.targetJobId } }); if (job) keys.push(job.occupation ?? "", ...asArray<string>(job.domains), job.workMode ?? ""); }
  if (input.targetCandidateId) { const candidate = await db.candidateProfile.findUnique({ where: { id: input.targetCandidateId } }); if (candidate) keys.push(candidate.occupation ?? "", ...asArray<string>(candidate.domains)); }
  for (const key of keys.filter(Boolean)) inferred[key] = Math.max(-5, Math.min(5, (inferred[key] ?? 0) + strength));
  await db.recommendationPreference.update({ where: { id: preference.id }, data: { inferred, confidence: Math.min(1, preference.confidence + .03) } });
  return event;
}
