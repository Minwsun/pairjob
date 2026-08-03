import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";
import { normalizeTaxonomyText } from "@/lib/taxonomy/service";
import { CANDIDATE_EXTRACTION_VERSION } from "@/lib/candidates/versions";

const DRAFT_VERSION = "candidate-draft-v1";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const asRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const textValue = (value: unknown) => typeof value === "string" ? value : "";

function skillPhrases(sections: Record<string, unknown>, rawText: string) {
  const source = textValue(sections.skills) || rawText.split(/\r?\n/).filter((line) => /react|javascript|typescript|python|java|sql|figma|docker|node|excel|power bi|photoshop/i.test(line)).join("\n");
  return [...new Set(source.split(/[\n,;|•·]+/).map((item) => item.replace(/^[-*]\s*/, "").trim()).filter((item) => item.length >= 2 && item.length <= 80))].slice(0, 40);
}

function displayTitle(rawText: string) {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12);
  return lines.find((line) => !/@|\+?\d[\d\s().-]{7,}|linkedin|github|portfolio/i.test(line) && /developer|engineer|designer|analyst|manager|specialist|intern|developer|lập trình|thiết kế|phân tích|kỹ sư/i.test(line)) ?? lines[1] ?? lines[0] ?? "Hồ sơ ứng viên";
}

export async function createCandidateDraft(documentId: string) {
  const { profile } = await getDemoCandidate();
  const document = await db.document.findFirstOrThrow({ where: { id: documentId, ownerId: profile.userId } });
  if (!document.rawText || document.status !== "PARSED") throw new Error("DOCUMENT_NOT_PARSED");
  const rawText = document.rawText;
  const contentHash = hash(rawText);
  const parserMetadata = asRecord(document.parserMetadata);
  if (parserMetadata.contentHash === contentHash && parserMetadata.candidateProfileId === profile.id && parserMetadata.candidateExtractionVersion === CANDIDATE_EXTRACTION_VERSION) return { profile, needsEnrichment: false, changedSections: [], reusedSections: Object.keys(asRecord(document.sections)) };
  const sections = asRecord(document.sections);
  const sectionHashes = Object.fromEntries(Object.entries(sections).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([key, value]) => [key, hash(value)]));
  const previousHashes = asRecord(parserMetadata.sectionHashes);
  const changedSections = Object.keys(sectionHashes).filter((key) => previousHashes[key] !== sectionHashes[key]);
  const reusedSections = Object.keys(sectionHashes).filter((key) => previousHashes[key] === sectionHashes[key]);
  const phrases = skillPhrases(sections, rawText);
  const normalized = phrases.map(normalizeTaxonomyText);
  const aliases = normalized.length ? await db.taxonomyAlias.findMany({ where: { normalized: { in: normalized }, label: { type: "skill", status: "ACTIVE" } }, include: { label: true } }) : [];
  const phraseByNormalized = new Map(phrases.map((phrase) => [normalizeTaxonomyText(phrase), phrase]));
  const skills = [...new Map(aliases.map((alias) => [alias.label.id, { id: alias.label.id, label: alias.label.preferredName, level: 2, years: 0, claimedLevel: 2, evidenceLevel: 2, effectiveLevel: 2, levelConfidence: .45, evidence: [{ sourceType: "skills", sourceText: phraseByNormalized.get(alias.normalized) ?? alias.alias, confidence: .7 }] }])).values()].slice(0, 20);
  const experienceMatch = document.rawText.match(/(?:khoảng|hơn|trên|over|about)?\s*(\d+(?:[.,]\d+)?)\s*(?:năm|years?)/i);
  const experienceYears = experienceMatch ? Number(experienceMatch[1].replace(",", ".")) : profile.experienceYears;
  const nextVersion = profile.profileVersion + 1;
  const updated = await db.$transaction(async (transaction) => {
    await transaction.profileRevision.create({ data: { candidateProfileId: profile.id, version: profile.profileVersion, source: "CV_DRAFT", snapshot: { displayTitle: profile.displayTitle, occupation: profile.occupation, skills: profile.skills, domains: profile.domains, experiences: profile.experiences, projects: profile.projects, education: profile.education, experienceYears: profile.experienceYears, workModes: profile.workModes, availabilityHours: profile.availabilityHours, hourlyRate: profile.hourlyRate, evidenceQuality: profile.evidenceQuality, completeness: profile.completeness, verified: profile.verified, profileVersion: profile.profileVersion } } });
    return transaction.candidateProfile.update({ where: { id: profile.id }, data: { displayTitle: displayTitle(rawText), skills: skills as Prisma.InputJsonValue, experienceYears, completeness: Math.max(profile.completeness, skills.length ? .45 : .25), evidenceQuality: skills.length ? .7 : profile.evidenceQuality, verified: false, profileVersion: nextVersion } });
  });
  await db.document.update({ where: { id: document.id }, data: { parserMetadata: { ...parserMetadata, contentHash, sectionHashes, candidateDraftVersion: DRAFT_VERSION, candidateExtractionVersion: null, candidateProfileId: profile.id, candidateDraftProfileVersion: nextVersion } as Prisma.InputJsonValue } });
  return { profile: updated, needsEnrichment: true, changedSections, reusedSections };
}
