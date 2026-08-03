import { z } from "zod";

const evidence = z.object({
  source_type: z.string(),
  source_text: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

function namedRequirements(value: unknown, kind: "language" | "certification") {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) item = { raw_name: item };
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const pair = Object.entries(record).find(([, entry]) => typeof entry === "string");
    const rawName = String(record.raw_name ?? record.interpreted_name ?? record.name ?? record.language ?? record.certification ?? pair?.[0] ?? "").trim();
    if (!rawName) return [];
    const interpretedName = String(record.interpreted_name ?? record.normalized_name ?? record.name ?? rawName).trim();
    const levelValue = record.level ?? record.proficiency ?? (pair?.[0] === rawName ? pair[1] : null);
    const requiredValue = record.required ?? record.is_required ?? record.mandatory;
    const source = record.evidence && typeof record.evidence === "object" && !Array.isArray(record.evidence) ? record.evidence as Record<string, unknown> : {};
    return [{
      raw_name: rawName,
      interpreted_name: interpretedName || rawName,
      ...(kind === "language" ? { level: levelValue == null ? null : String(levelValue) } : {}),
      required: typeof requiredValue === "boolean" ? requiredValue : String(requiredValue ?? "").toLowerCase() === "true",
      evidence: {
        source_type: String(source.source_type ?? "job_description"),
        source_text: String(source.source_text ?? rawName),
        confidence: Math.max(0, Math.min(1, Number(source.confidence ?? .65))),
      },
    }];
  });
}

const semanticMention = z.object({
  raw_text: z.string().min(1),
  interpreted_text: z.string().min(1),
  entity_type: z.enum(["occupation", "skill", "language", "certification", "degree_level", "field_of_study", "experience", "domain", "work_mode", "contract", "unknown"]),
  confidence: z.number().min(0).max(1),
  evidence,
  relation: z.enum(["single", "concurrent", "alternative", "qualification", "negated"]).default("single"),
});

export const jobExtractionSchema = z.object({
  corrected_interpretation: z.string(),
  corrections: z.array(z.object({ raw_text: z.string(), corrected_text: z.string(), confidence: z.number().min(0).max(1), reason: z.string() })),
  mentions: z.array(semanticMention),
  occupation_text: z.string().nullable(),
  skills_detected: z.array(z.object({ raw_name: z.string(), requirement_type: z.enum(["required", "preferred", "not_required", "uncertain", "unknown"]), requirement_confidence: z.number().min(0).max(1).default(.5), requirement_reason: z.string().default("Không đủ thông tin."), importance: z.number().min(1).max(5), evidence })),
  experience_min_years: z.number().min(0).nullable(),
  work_mode: z.enum(["remote", "hybrid", "onsite", "flexible"]).nullable(),
  domains_detected: z.array(z.string()),
  languages_detected: z.preprocess((value) => namedRequirements(value, "language"), z.array(z.object({ raw_name: z.string(), interpreted_name: z.string(), level: z.string().nullable(), required: z.boolean(), evidence }))),
  certifications_detected: z.preprocess((value) => namedRequirements(value, "certification"), z.array(z.object({ raw_name: z.string(), interpreted_name: z.string(), required: z.boolean(), evidence }))),
  education_requirements: z.array(z.object({ raw_name: z.string(), interpreted_name: z.string(), entity_type: z.enum(["degree_level", "field_of_study"]), requirement_type: z.enum(["required", "preferred", "not_required", "uncertain"]), evidence })),
  availability_min: z.number().min(0).nullable(),
  budget_max: z.number().min(0).nullable(),
  deadline_text: z.string().nullable().default(null),
  project_duration_text: z.string().nullable().default(null),
  missing_fields: z.array(z.string()),
});

export const clarificationToolSchema = z.object({
  done: z.boolean(),
  auto_confirmed: z.array(z.object({ field: z.string(), value: z.string(), confidence: z.number().min(0).max(1), reason: z.string() })).max(12).default([]),
  remaining_risks: z.array(z.string()).max(12).default([]),
  questions: z.array(z.object({
    field: z.string().min(1),
    header: z.string().min(1).max(40),
    question: z.string().min(5).max(240),
    reason: z.string().min(5).max(300),
    impact: z.number().int().min(1).max(10),
    required: z.boolean(),
    allow_custom: z.boolean(),
    recommended_option: z.string().nullable(),
    options: z.array(z.object({
      value: z.string().min(1),
      label: z.string().min(1).max(80),
      description: z.string().min(1).max(180),
    })).max(3),
    information_gain: z.number().min(0).max(1).default(.5),
    affected_fields: z.array(z.string()).max(8).default([]),
  })).max(3),
});

const taxonomyRelations = ["IS_A", "BROADER", "NARROWER", "RELATED", "EXACT_MATCH", "CLOSE_MATCH", "BROAD_MATCH", "NARROW_MATCH", "RELATED_MATCH", "PART_OF", "REQUIRES", "REQUIRES_KNOWLEDGE", "ENABLES", "DEMONSTRATED_BY", "PERFORMS_TASK", "ESSENTIAL_FOR", "OPTIONAL_FOR", "USES_TECHNOLOGY", "IMPLEMENTED_WITH", "PREREQUISITE_FOR", "ESSENTIAL_SKILL", "OPTIONAL_SKILL", "PREFERRED_FOR", "RELATED_TO", "TRANSFERABLE_TO", "USED_WITH", "APPLIED_IN", "COMBINES"] as const;

const taxonomyRelationSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return ({ RELATEDNESS: "RELATED", ASSOCIATED_WITH: "RELATED_TO", DEPENDS_ON: "REQUIRES", USES: "USES_TECHNOLOGY", TRANSFERABLE: "TRANSFERABLE_TO" } as Record<string, string>)[normalized] ?? normalized;
}, z.enum(taxonomyRelations));

export const taxonomyResolutionSchema = z.object({
  action: z.enum(["USE_EXISTING", "CREATE_CHILD", "CREATE_RELATED"]),
  selected_id: z.string().nullable(),
  preferred_name: z.string().min(1),
  definition: z.string().min(10),
  aliases: z.array(z.string().min(1)).max(10),
  parent_ids: z.array(z.string()).max(3),
  related: z.array(z.object({ label_id: z.string(), relation: taxonomyRelationSchema, confidence: z.number().min(0).max(1) })).max(8),
  confidence: z.number().min(0).max(1),
  novelty_score: z.number().min(0).max(1).default(.5),
  candidate_comparisons: z.array(z.object({ label_id: z.string(), similarity: z.number().min(0).max(1), same_concept: z.boolean(), reason: z.string() })).max(10).default([]),
  concept_components: z.array(z.string()).max(12).default([]),
  proposed_path: z.array(z.object({
    preferred_name: z.string().min(2),
    type: z.enum(["field", "specialization", "skill_group", "capability_group", "capability", "task_group", "task", "domain_group"]),
    definition: z.string().min(10),
  })).max(3).default([]),
  auto_approval_reason: z.string().default("Validated by semantic resolver and duplicate gate."),
  rationale: z.string().min(5),
});

export const semanticMatchSchema = z.object({
  occupation_semantic_score: z.number().min(0).max(1).default(0),
  task_similarity: z.number().min(0).max(1).default(0),
  transferable_skill_score: z.number().min(0).max(1).default(0),
  project_domain_similarity: z.number().min(0).max(1).default(0),
  evidence_support: z.number().min(0).max(1).default(0),
  rerank_delta: z.number().min(-8).max(8),
  confidence_delta: z.number().min(-10).max(5),
  supported_evidence: z.array(z.string()).max(8).default([]),
  rejected_assumptions: z.array(z.string()).max(6).default([]),
  reasons: z.array(z.string()).max(4),
  warnings: z.array(z.string()).max(4),
});

const requirementSections = ["responsibility", "required_skill", "preferred_skill", "experience", "work_arrangement", "compensation", "education", "language", "certification", "deadline", "other"] as const;
const requirementSectionAliases: Record<string, typeof requirementSections[number]> = {
  responsibilities: "responsibility", duties: "responsibility", tasks: "responsibility", trach_nhiem: "responsibility", nhiem_vu: "responsibility",
  skill: "required_skill", skills: "required_skill", required_skills: "required_skill", must_have: "required_skill", technical_skill: "required_skill", ky_nang_bat_buoc: "required_skill",
  preferred_skills: "preferred_skill", nice_to_have: "preferred_skill", bonus_skill: "preferred_skill", ky_nang_uu_tien: "preferred_skill",
  experiences: "experience", seniority: "experience", kinh_nghiem: "experience",
  work_mode: "work_arrangement", location: "work_arrangement", workplace: "work_arrangement", schedule: "work_arrangement", hinh_thuc_lam_viec: "work_arrangement",
  salary: "compensation", budget: "compensation", benefits: "compensation", luong: "compensation", ngan_sach: "compensation",
  degree: "education", qualification: "education", qualifications: "education", bang_cap: "education", hoc_van: "education",
  languages: "language", ngoai_ngu: "language", certifications: "certification", certificate: "certification", chung_chi: "certification",
  due_date: "deadline", timeline: "deadline", duration: "deadline", thoi_han: "deadline",
};

function normalizeRequirementSection(value: unknown) {
  const normalized = String(value ?? "other").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim().replace(/[\s/-]+/g, "_");
  return requirementSections.includes(normalized as typeof requirementSections[number]) ? normalized : requirementSectionAliases[normalized] ?? "other";
}

export const canonicalJobRequirementsSchema = z.object({
  summary: z.string().min(20).max(1200),
  requirements: z.array(z.object({
    section: z.preprocess(normalizeRequirementSection, z.enum(requirementSections)),
    statement: z.string().min(5).max(300),
    source_fields: z.array(z.string()).min(1).max(8),
  })).max(30),
});

export const careerRoadmapSchema = z.object({
  presentation_version: z.number().int().default(2),
  target: z.string().default(""),
  occupation_id: z.string().default(""),
  current_level: z.string().default(""),
  target_level: z.string().default(""),
  summary: z.string().min(20),
  current_score: z.number().min(0).max(100).default(0),
  projected_score: z.number().min(0).max(100).default(0),
  evaluated_jobs: z.number().int().min(0).default(0),
  current_position: z.object({ title: z.string(), level: z.string(), reasons: z.array(z.string()).min(1).max(4) }),
  doing_well: z.array(z.object({ title: z.string(), explanation: z.string() })).max(6).default([]),
  needs_improvement: z.array(z.object({ title: z.string(), explanation: z.string(), next_action: z.string() })).max(8).default([]),
  growth_opportunities: z.array(z.object({ title: z.string(), explanation: z.string(), next_action: z.string() })).max(8).default([]),
  future_directions: z.array(z.object({ title: z.string(), why_fit: z.string(), capabilities_to_build: z.array(z.string()).min(1).max(6), possible_position: z.string() })).max(6).default([]),
  strengths: z.array(z.object({ skill_id: z.string().default(""), skill: z.string(), level: z.number().min(0).max(5), assessment: z.string(), evidence: z.array(z.string()).max(4), confidence: z.number().min(0).max(1) })).max(8).default([]),
  gaps: z.array(z.object({ skill_id: z.string().default(""), skill: z.string(), gap_type: z.enum(["missing_skill", "proficiency_gap", "evidence_gap", "transferable_skill"]), why: z.string(), related_skill: z.string().nullable().default(null), frequency: z.number().min(0).max(1).default(0), estimated_impact: z.number().min(0).max(100).default(0), taxonomy_path: z.array(z.string()).default([]) })).max(8).default([]),
  steps: z.array(z.object({ priority: z.number().int().min(1), skill: z.string(), reason: z.string(), practice_action: z.string(), evidence_to_add: z.string(), estimated_impact: z.number().min(0).max(100).default(0), taxonomy_path: z.array(z.string()).default([]) })).max(8).default([]),
  phases: z.array(z.object({ order: z.number().int().min(1), title: z.string(), goal: z.string(), reason: z.string().default(""), skills: z.array(z.string()).max(6), actions: z.array(z.string()).min(1).max(6), deliverable: z.string(), evidence_to_add: z.string(), completion_criteria: z.array(z.string()).min(1).max(6), readiness_signs: z.array(z.string()).max(6).default([]), expected_impact: z.number().min(0).max(100) })).min(1).max(6),
  market_context: z.string().default(""),
});

export const cvExtractionSchema = z.object({
  display_title: z.string().nullable(),
  occupation: z.string().nullable(),
  experience_years: z.number().min(0),
  skills: z.array(z.object({ raw_name: z.string(), level: z.number().min(1).max(5), years: z.number().min(0), evidence: z.array(evidence) })),
  domains: z.array(z.string()),
  experiences: z.array(z.object({ company: z.string(), title: z.string(), start_date: z.string().nullable(), end_date: z.string().nullable(), description: z.string() })),
  projects: z.array(z.object({ name: z.string(), domain: z.string().nullable(), technologies: z.array(z.string()), description: z.string() })),
  education: z.array(z.object({ school: z.string(), degree: z.string().nullable(), field: z.string().nullable(), graduation_year: z.number().int().nullable().default(null), evidence: z.array(evidence).default([]) })),
  work_modes: z.array(z.enum(["remote", "hybrid", "onsite", "flexible"])),
  availability_hours: z.number().min(0).nullable().default(null),
  hourly_rate: z.number().min(0).nullable().default(null),
});

export const cvAgentExtractionSchema = z.object({
  profile: cvExtractionSchema,
  clarification: clarificationToolSchema,
});

export const seedSchema = z.object({
  candidates: z.array(z.object({
    name: z.string(), email: z.string().email(), display_title: z.string(), occupation: z.string(), experience_years: z.number(),
    skills: z.array(z.object({ id: z.string(), label: z.string(), level: z.number().min(1).max(5), years: z.number(), evidence: z.array(evidence) })),
    domains: z.array(z.string()), work_modes: z.array(z.string()), availability_hours: z.number(), hourly_rate: z.number(),
  })),
  jobs: z.array(z.object({
    raw_title: z.string(), raw_description: z.string(), display_title: z.string(), company: z.string(), occupation: z.string(),
    required_skills: z.array(z.object({ id: z.string(), label: z.string(), level: z.number().min(1).max(5) })),
    preferred_skills: z.array(z.object({ id: z.string(), label: z.string() })), domains: z.array(z.string()), experience_min: z.number(),
    work_mode: z.string(), availability_min: z.number(), budget_max: z.number(),
  })),
});

export const candidateSeedSchema = seedSchema.pick({ candidates: true });
export const jobSeedSchema = seedSchema.pick({ jobs: true });
