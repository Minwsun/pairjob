import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";
import { cvExtractionSchema } from "@/lib/ai/schemas";
import { systemPrompts } from "@/lib/prompts";
import { extractWithAgent } from "@/lib/ai/extraction-agent";
import { resolveTaxonomyConceptsFast } from "@/lib/taxonomy/semantic-resolver";
import { normalizeTaxonomyText } from "@/lib/taxonomy/service";
import { candidateSearchDocument } from "@/lib/embeddings/documents";
import { normalizeSkillProficiency } from "@/lib/proficiency";
import type { ProgressReporter } from "@/lib/progress";
import { profileSnapshot } from "@/lib/profile-snapshot";
import { enqueueRecompute } from "@/lib/recompute";
import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { CANDIDATE_EXTRACTION_VERSION } from "@/lib/candidates/versions";

const noop: ProgressReporter = () => {};
const evidenceSource = (value: string) => (["job_description", "experience", "project", "skills"].includes(value) ? value : "skills") as "job_description" | "experience" | "project" | "skills";
const normalizedTokens = (value: string) => normalizeTaxonomyText(value).split(/[^a-z0-9+#.]+/).filter((token) => token.length > 1);

export function groundedCandidateSkills<T extends { raw_name: string; evidence: { source_text: string }[] }>(skills: T[], rawText: string) {
  const source = normalizeTaxonomyText(rawText);
  return skills.filter((skill) => {
    if (!skill.evidence.length) return false;
    const skillTokens = normalizedTokens(skill.raw_name);
    return skill.evidence.some((item) => {
      const quote = normalizeTaxonomyText(item.source_text);
      if (!quote || !source.includes(quote)) return false;
      return skillTokens.length === 0 || skillTokens.some((token) => quote.includes(token) || source.includes(token));
    });
  });
}

export function declaredSkillMentions(sections: Record<string, unknown>) {
  const content = typeof sections.skills === "string" ? sections.skills : "";
  const ignored = new Set(["skill", "skills", "ky nang", "technical skills", "core skills", "cong cu"]);
  return [...new Set(content.split(/[\n,;|â€¢·]+/).map((item) => item.replace(/^[-*]\s*/, "").trim()).filter((item) => {
    const normalized = normalizeTaxonomyText(item);
    const words = normalized.split(" ").filter(Boolean);
    return item.length >= 2 && item.length <= 50 && words.length <= 6 && !ignored.has(normalized);
  }))];
}

export function evidenceSkillMentions(input: { rawText: string; projects: { technologies: string[] }[] }) {
  const mentions = input.projects.flatMap((project) => project.technologies.map((rawName) => ({ rawName, sourceType: "project", sourceText: rawName })));
  for (const match of input.rawText.matchAll(/(?:using|toolkit included|technologies?|kỹ năng|ky nang)\s*[:\-]?\s*([^\n.!?]+)/gi)) {
    const sourceText = match[0].trim();
    for (const rawName of match[1].split(/[,;|/]+|\s+(?:and|và|va)\s+/i).map((item) => item.trim()).filter((item) => item.length >= 2 && item.length <= 50 && item.split(/\s+/).length <= 6)) mentions.push({ rawName, sourceType: "experience", sourceText });
  }
  return mentions;
}

export async function extractCandidate(documentId: string, report: ProgressReporter = noop, expectedProfileVersion?: number) {
  const { profile } = await getDemoCandidate();
  report({ type: "stage_started", stage: "load_document", label: "Đọc tài liệu đã parse", progress: 5 });
  const document = await db.document.findFirstOrThrow({ where: { id: documentId, ownerId: profile.userId } });
  if (!document.rawText || document.status !== "PARSED") throw new Error("DOCUMENT_NOT_PARSED");
  const contentHash = createHash("sha256").update(document.rawText).digest("hex");
  const parserMetadata = document.parserMetadata && typeof document.parserMetadata === "object" && !Array.isArray(document.parserMetadata) ? document.parserMetadata as Record<string, unknown> : {};
  if (parserMetadata.contentHash === contentHash && parserMetadata.candidateExtractionVersion === CANDIDATE_EXTRACTION_VERSION && parserMetadata.candidateProfileId === profile.id) {
    report({ type: "stage_completed", stage: "load_document", label: "Đã dùng canonical profile đã lưu", progress: 98, message: "Không gọi lại LLM cho cùng nội dung CV" });
    return profile;
  }
  report({ type: "stage_completed", stage: "load_document", label: "Đã đọc tài liệu", progress: 12, message: `${document.rawText.length} ký tự` });
  report({ type: "stage_started", stage: "extract", label: "AI đang trích xuất hồ sơ và evidence", progress: 18 });
  const sections = document.sections && typeof document.sections === "object" && !Array.isArray(document.sections) ? document.sections as Record<string, unknown> : {};
  const compactText = ["summary", "experience", "projects", "skills", "education"].map((key) => typeof sections[key] === "string" ? `${key.toUpperCase()}\n${String(sections[key]).slice(0, 900)}` : "").filter(Boolean).join("\n\n").slice(0, 4000) || document.rawText.slice(0, 4000);
  const sectionManifest = Object.fromEntries(Object.entries(sections).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([key, value]) => [key, { characters: value.length, preview: value.slice(0, 180) }]));
  const extractionRun = await extractWithAgent({ skill: "extract_candidate", system: systemPrompts.cvExtractor, rawText: document.rawText, sections, context: { excerpt: compactText, section_manifest: sectionManifest, instruction: "Trích xuất dữ liệu có căn cứ. Chỉ gọi tool cho phần thiếu hoặc mơ hồ; không suy diễn kỹ năng không được CV chứng minh." }, outputSchema: cvExtractionSchema, actorId: profile.userId });
  const extracted = extractionRun.output;
  const declared = declaredSkillMentions(sections);
  const known = new Set(extracted.skills.map((skill) => normalizeTaxonomyText(skill.raw_name)));
  for (const rawName of declared) if (!known.has(normalizeTaxonomyText(rawName))) extracted.skills.push({ raw_name: rawName, level: 2, years: 0, evidence: [{ source_type: "skills", source_text: rawName, confidence: .72 }] });
  for (const mention of evidenceSkillMentions({ rawText: document.rawText, projects: extracted.projects })) if (!known.has(normalizeTaxonomyText(mention.rawName))) { extracted.skills.push({ raw_name: mention.rawName, level: 2, years: 0, evidence: [{ source_type: mention.sourceType, source_text: mention.sourceText, confidence: .76 }] }); known.add(normalizeTaxonomyText(mention.rawName)); }
  extracted.skills = groundedCandidateSkills(extracted.skills, document.rawText);
  report({ type: "stage_completed", stage: "extract", label: "Đã trích xuất thông tin CV", progress: 48, message: `${extracted.skills.length} kỹ năng được nhận diện` });
  report({ type: "stage_started", stage: "taxonomy", label: "Chuẩn hóa nghề, kỹ năng và bằng cấp", progress: 54 });
  const occupationText = extracted.occupation ?? extracted.display_title;
  const concepts = [
    ...(occupationText ? [{ rawText: occupationText, type: "occupation", evidence: extracted.display_title ?? occupationText }] : []),
    ...extracted.skills.map((skill) => ({ rawText: skill.raw_name, type: "skill", evidence: skill.evidence[0]?.source_text })),
    ...extracted.domains.map((domain) => ({ rawText: domain, type: "domain", evidence: domain })),
    ...extracted.education.flatMap((item) => [...(item.degree ? [{ rawText: item.degree, type: "degree_level", evidence: item.evidence[0]?.source_text ?? item.degree }] : []), ...(item.field ? [{ rawText: item.field, type: "field_of_study", evidence: item.evidence[0]?.source_text ?? item.field }] : [])]),
  ];
  const occupationResolution = occupationText ? await resolveTaxonomyConceptsFast([concepts[0]]) : [];
  const remainingConcepts = occupationText ? concepts.slice(1) : concepts;
  const resolutions = [...occupationResolution, ...await resolveTaxonomyConceptsFast(remainingConcepts)];
  let resolutionIndex = 0;
  const occupation = occupationText ? resolutions[resolutionIndex++] : null;
  const resolvedSkills = extracted.skills.map((skill) => ({ skill, resolution: resolutions[resolutionIndex++] }));
  const resolvedDomains = extracted.domains.map(() => resolutions[resolutionIndex++]);
  const resolvedEducation = extracted.education.map((item) => ({ item, degree: item.degree ? resolutions[resolutionIndex++] : null, field: item.field ? resolutions[resolutionIndex++] : null }));
  const skills = resolvedSkills.map(({ skill, resolution }) => normalizeSkillProficiency({ id: resolution.label.id, label: resolution.label.preferredName, level: skill.level, claimedLevel: skill.level, years: skill.years, evidence: skill.evidence.map((item) => ({ sourceType: evidenceSource(item.source_type), sourceText: item.source_text, confidence: item.confidence })) }));
  report({ type: "stage_completed", stage: "taxonomy", label: "Đã chuẩn hóa taxonomy hồ sơ", progress: 78, message: occupation?.label.preferredName ?? "Chưa xác định nghề chính" });
  report({ type: "stage_started", stage: "proficiency", label: "Tính proficiency và chất lượng evidence", progress: 82 });
  const evidenceQuality = skills.length ? skills.flatMap((skill) => skill.evidence).reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, skills.flatMap((skill) => skill.evidence).length) : 0;
  const completeness = [extracted.display_title, extracted.occupation, skills.length, extracted.experience_years, extracted.work_modes.length, extracted.availability_hours].filter(Boolean).length / 6;
  report({ type: "stage_completed", stage: "proficiency", label: "Đã tính chất lượng hồ sơ", progress: 90, message: `Evidence ${Math.round(evidenceQuality * 100)}% · Completeness ${Math.round(completeness * 100)}%` });
  report({ type: "stage_started", stage: "save", label: "Lưu canonical candidate profile", progress: 93 });
  const baseVersion = expectedProfileVersion ?? profile.profileVersion;
  const nextVersion = baseVersion + 1;
  const data = { displayTitle: extracted.display_title, occupation: occupation?.label.id, experienceYears: extracted.experience_years, skills, domains: resolvedDomains.map((item) => item.label.id), experiences: extracted.experiences, projects: extracted.projects, education: resolvedEducation.map(({ item, degree, field }) => ({ ...item, degreeLevelId: degree?.label.id ?? null, fieldOfStudyId: field?.label.id ?? null })), workModes: extracted.work_modes, availabilityHours: extracted.availability_hours, hourlyRate: extracted.hourly_rate, evidenceQuality, completeness, verified: true, profileVersion: nextVersion };
  const assertions = [
    ...(occupation ? [{ candidateProfileId: profile.id, taxonomyLabelId: occupation.label.id, assertionType: "EVIDENCE_DERIVED", proficiency: null, confidence: occupation.confidence, evidence: [{ sourceType: "skills", sourceText: extracted.display_title ?? extracted.occupation ?? occupation.label.preferredName, confidence: occupation.confidence }] as Prisma.InputJsonValue, sourceVersion: nextVersion }] : []),
    ...resolvedSkills.map(({ skill, resolution }) => ({ candidateProfileId: profile.id, taxonomyLabelId: resolution.label.id, assertionType: skill.evidence.length ? "EVIDENCE_DERIVED" : "EXPLICIT", proficiency: skill.level, confidence: skill.evidence.length ? Math.max(...skill.evidence.map((item) => item.confidence)) : resolution.confidence, evidence: skill.evidence as Prisma.InputJsonValue, sourceVersion: nextVersion })),
  ];
  await db.$transaction(async (tx) => {
    const latest = await tx.candidateProfile.findUniqueOrThrow({ where: { id: profile.id } });
    if (latest.profileVersion !== baseVersion) throw new Error("CANDIDATE_ENRICHMENT_SUPERSEDED");
    await tx.profileRevision.create({ data: { candidateProfileId: profile.id, version: baseVersion, source: "CV_EXTRACTION", snapshot: profileSnapshot(latest) } });
    await tx.candidateConceptAssertion.updateMany({ where: { candidateProfileId: profile.id, active: true }, data: { active: false } });
    if (assertions.length) await tx.candidateConceptAssertion.createMany({ data: assertions });
    await tx.candidateClarificationQuestion.updateMany({ where: { candidateProfileId: profile.id, status: "PENDING" }, data: { status: "INVALIDATED" } });
    await tx.candidateProfile.update({ where: { id: profile.id }, data: { ...data, searchDocument: candidateSearchDocument(data), embeddingModel: null, embeddingUpdatedAt: null } });
  });
  const updated = await db.candidateProfile.findUniqueOrThrow({ where: { id: profile.id } });
  await db.$executeRaw`UPDATE "CandidateProfile" SET embedding = NULL, "queryEmbedding" = NULL WHERE id = ${profile.id}`;
  await db.document.update({ where: { id: document.id }, data: { parserMetadata: { ...parserMetadata, contentHash, candidateExtractionVersion: CANDIDATE_EXTRACTION_VERSION, candidateProfileId: profile.id, candidateProfileVersion: nextVersion } as Prisma.InputJsonValue } });
  await enqueueRecompute(profile.id, nextVersion);
  report({ type: "stage_completed", stage: "save", label: "Canonical profile đã được lưu", progress: 98 });
  return updated;
}
