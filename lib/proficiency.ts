import type { Skill } from "@/lib/types";

const clampLevel = (value: number) => Math.max(1, Math.min(5, value));

export function evidenceLevel(skill: Pick<Skill, "level" | "years" | "evidence">) {
  if (!skill.evidence.length) return clampLevel(Math.min(skill.level, 1 + Math.log2(1 + Math.max(0, skill.years))));
  const confidence = skill.evidence.reduce((sum, item) => sum + item.confidence, 0) / skill.evidence.length;
  const sourceBreadth = new Set(skill.evidence.map((item) => item.sourceType)).size;
  return clampLevel(1 + confidence * 2.5 + Math.min(1, skill.years / 4) + Math.min(.5, sourceBreadth * .2));
}

export function normalizeSkillProficiency(skill: Skill): Skill {
  if (skill.effectiveLevel !== undefined) return skill;
  const claimedLevel = clampLevel(skill.claimedLevel ?? skill.level);
  const derivedEvidenceLevel = skill.evidenceLevel ?? evidenceLevel(skill);
  const levelConfidence = skill.levelConfidence ?? (skill.evidence.length ? Math.min(1, .45 + skill.evidence.length * .12) : .3);
  const effectiveLevel = clampLevel(claimedLevel * (1 - levelConfidence) + derivedEvidenceLevel * levelConfidence);
  return { ...skill, claimedLevel, evidenceLevel: derivedEvidenceLevel, effectiveLevel, levelConfidence };
}

export function effectiveSkillLevel(skill: Skill) {
  return skill.effectiveLevel ?? skill.level;
}
