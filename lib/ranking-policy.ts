import { db } from "@/lib/db";

export type RankingWeights = Record<"match" | "confidence" | "retrieval" | "preference" | "evidence" | "availability" | "freshness", number>;

const defaults: Record<string, RankingWeights> = {
  CANDIDATES_FOR_JOB: { match: .72, confidence: .08, retrieval: .12, preference: .05, evidence: .03, availability: 0, freshness: 0 },
  JOBS_FOR_CANDIDATE: { match: .70, confidence: .07, retrieval: .10, preference: .06, evidence: 0, availability: .04, freshness: .03 },
};

const versions: Record<keyof typeof defaults, string> = {
  CANDIDATES_FOR_JOB: "candidates_for_job-baseline-v1",
  JOBS_FOR_CANDIDATE: "jobs_for_candidate-semantic-v2",
};

export async function activeRankingPolicy(kind: keyof typeof defaults) {
  const version = versions[kind];
  const existing = await db.rankingPolicy.findUnique({ where: { version } });
  if (existing?.active) return { version: existing.version, weights: existing.weights as RankingWeights };
  const created = await db.$transaction(async (transaction) => {
    await transaction.rankingPolicy.updateMany({ where: { kind, active: true }, data: { active: false } });
    return transaction.rankingPolicy.upsert({ where: { version }, update: { weights: defaults[kind], active: true }, create: { kind, version, weights: defaults[kind], active: true } });
  });
  return { version: created.version, weights: created.weights as RankingWeights };
}

export function scoreWithPolicy(weights: RankingWeights, features: Partial<Record<keyof RankingWeights, number>>) {
  const active = Object.entries(features).filter((entry): entry is [keyof RankingWeights, number] => typeof entry[1] === "number");
  const total = active.reduce((sum, [key]) => sum + Math.max(0, weights[key]), 0) || 1;
  return active.reduce((sum, [key, value]) => sum + value * Math.max(0, weights[key]), 0) / total;
}
