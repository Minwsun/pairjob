import type { FitStatus } from "@/lib/types";

export function fitStatusFromScore(score: number, blockers: string[] = []): FitStatus {
  if (blockers.length) return "not_fit";
  if (score >= 58) return "qualified";
  if (score >= 25) return "skill_gap";
  return "not_fit";
}

export function fitStatusFromEvidence(score: number, hardBlockers: string[], criticalGapCount: number, semanticEquivalent: boolean, softBlockers: string[] = []): FitStatus {
  if (hardBlockers.length || score < 25) return "not_fit";
  if (softBlockers.length) return "skill_gap";
  if (criticalGapCount > 0) return "skill_gap";
  if (score >= 58 || (semanticEquivalent && score >= 55)) return "qualified";
  return "skill_gap";
}

export function badgeForFitStatus(status: FitStatus) {
  return status === "qualified" ? { color: "green", label: "Phù hợp" } : status === "skill_gap" ? { color: "amber", label: "Tương đối phù hợp" } : { color: "red", label: "Không phù hợp" };
}

export function requirementBadge(score: number) {
  return score >= .58 ? { color: "green", label: "Đáp ứng" } : score >= .18 ? { color: "amber", label: "Liên quan / còn thiếu" } : { color: "red", label: "Chưa đáp ứng" };
}
