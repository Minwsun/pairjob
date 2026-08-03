export type Role = "employer" | "candidate";

export type Evidence = {
  sourceType: "job_description" | "experience" | "project" | "skills";
  sourceText: string;
  confidence: number;
};

export type Skill = {
  id: string;
  label: string;
  level: number;
  claimedLevel?: number;
  evidenceLevel?: number;
  effectiveLevel?: number;
  levelConfidence?: number;
  years: number;
  evidence: Evidence[];
};

export type Candidate = {
  id: string;
  name: string;
  title: string;
  occupation: string;
  skills: Skill[];
  domains: string[];
  experienceYears: number;
  workModes: string[];
  availability: number | null;
  evidenceQuality: number;
  rate: number | null;
  compensation?: Compensation;
  education?: { degreeLevelId: string | null; fieldOfStudyId: string | null; degree: string | null; field: string | null }[];
};

export type Job = {
  id: string;
  title: string;
  company: string;
  occupation: string;
  requiredSkills: { id: string; label: string; level: number }[];
  preferredSkills: { id: string; label: string }[];
  domains: string[];
  experienceMin: number;
  workMode: string;
  availabilityMin: number;
  budgetMin?: number;
  budgetMax: number;
  compensation?: Compensation;
  freshness: number;
  rawDescription?: string;
  correctedInterpretation?: string | null;
  contractType?: string | null;
  locationText?: string | null;
  deadlineText?: string | null;
  languageRequirements?: Record<string, unknown>[];
  certificationRequirements?: Record<string, unknown>[];
  educationRequirements?: { id: string; label: string; type: "degree_level" | "field_of_study"; requirementType: "required" | "preferred" }[];
};

export type CompensationPeriod = "HOUR" | "MONTH" | "PROJECT";
export type Compensation = {
  min: number | null;
  max: number | null;
  currency: "VND";
  period: CompensationPeriod;
};

export type RequiredSkillAssessment = {
  requirementId: string;
  requirement: string;
  candidateSkill: string | null;
  relation: "direct" | "semantic_equivalent" | "transferable" | "related" | "missing";
  contribution: number;
  evidenceConfidence: number;
  critical: boolean;
  status: FitStatus;
  path: string[];
};

export type FitStatus = "qualified" | "skill_gap" | "not_fit";
export type TreeMembership = { rootId: string; path: string[]; coverage: number; confidence: number };

export type MatchResult = {
  candidate: Candidate;
  score: number;
  confidence: number;
  eligible: boolean;
  fitStatus: FitStatus;
  requiredCoverage: number;
  directCoverage?: number;
  inferredCoverage?: number;
  transferableContribution?: number;
  evidenceCoverage?: number;
  treeCompatibility: number;
  occupationSimilarity?: number;
  occupationSimilarityMethod?: string;
  occupationSharedConcepts?: string[];
  hardConstraintViolations?: string[];
  softConstraintViolations?: string[];
  dynamicWeights?: Record<string, number>;
  semanticReview?: {
    occupationSemanticScore: number;
    taskSimilarity: number;
    transferableSkillScore: number;
    projectDomainSimilarity: number;
    evidenceSupport: number;
    supportedEvidence: string[];
    rejectedAssumptions: string[];
  };
  reasons: string[];
  breakdown: Record<string, number>;
  deterministicScore?: number;
  aiRerankDelta?: number;
  exactMatches?: string[];
  relatedMatches?: { requirement: string; candidateSkill: string; strength: number; path: string[] }[];
  missingRequirements?: string[];
  taxonomyPaths?: string[][];
  candidateTrees?: TreeMembership[];
  jobTrees?: TreeMembership[];
  hierarchicalMatches?: { requirementId: string; requirement: string; candidateSkillId: string; candidateSkill: string; strength: number; contribution: number; kind: "exact" | "equivalent" | "descendant" | "ancestor" | "transferable" | "related"; pathIds: string[]; path: string[] }[];
  skillGaps?: string[];
  requiredSkillAssessments?: RequiredSkillAssessment[];
  semanticCoverage?: number;
  criticalGapCount?: number;
  statusReason?: string;
};
