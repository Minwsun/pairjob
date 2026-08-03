import type { z } from "zod";
import { db } from "@/lib/db";
import { clarificationToolSchema, jobExtractionSchema } from "@/lib/ai/schemas";
import { planClarificationsWithAgent } from "@/lib/ai/clarification-agent";
import { buildClarificationQuestions } from "@/lib/jobs/clarifications";

type PlannedQuestion = z.infer<typeof clarificationToolSchema>["questions"][number];

const allowedFields = [
  "occupation", "experience_policy", "work_mode", "availability_min", "budget_max", "deadline", "contract_type",
  "location", "project_scope", "deliverables", "backend_scope", "payment_integration", "team_context", "portfolio_evidence",
  "communication", "timezone", "start_date", "security_compliance", "integration_requirements",
];

function fieldAllowed(field: string) {
  return allowedFields.includes(field) || /^(skill_requirement|language_level|certification_detail|detail):.+/.test(field);
}

export const semanticQuestionKey = (field: string, question: string) => `${field}:${question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;

function optionPresentation(field: string, value: string) {
  if (field.startsWith("skill_requirement:")) {
    const skillOptions: Record<string, [string, string]> = {
      required: ["Bắt buộc", "Ứng viên thiếu kỹ năng này sẽ bị xem là không đáp ứng yêu cầu cốt lõi."],
      preferred: ["Ưu tiên", "Kỹ năng này tăng điểm matching nhưng không loại ứng viên phù hợp khác."],
      not_required: ["Không yêu cầu", "Không dùng kỹ năng này để chấm hoặc lọc ứng viên."],
    };
    const presentation = skillOptions[value];
    if (presentation) return { value, label: presentation[0], description: presentation[1] };
  }
  const known: Record<string, Record<string, [string, string]>> = {
    work_mode: { remote: ["Remote", "Làm việc hoàn toàn từ xa."], hybrid: ["Hybrid", "Kết hợp từ xa và tại văn phòng."], onsite: ["On-site", "Làm việc trực tiếp tại văn phòng."], flexible: ["Linh hoạt", "Không dùng work mode làm điều kiện cứng."] },
    contract_type: { freelance: ["Freelance", "Hợp tác độc lập theo phạm vi công việc."], project_based: ["Theo dự án", "Kết thúc khi bàn giao dự án."], part_time: ["Part-time", "Làm bán thời gian theo tuần."], full_time: ["Full-time", "Cam kết toàn thời gian."] },
    experience_policy: { "0": ["Không bắt buộc", "Đánh giá chủ yếu bằng kỹ năng và portfolio."], "1": ["Từ 1 năm", "Phù hợp ứng viên junior đã có kinh nghiệm thực tế."], "2": ["Từ 2 năm", "Phù hợp mức kinh nghiệm trung bình."], "3": ["Từ 3 năm", "Ưu tiên ứng viên làm việc độc lập tốt."] },
    availability_min: { "10": ["10 giờ/tuần", "Phù hợp công việc nhỏ hoặc hỗ trợ."], "20": ["20 giờ/tuần", "Mức part-time cân bằng."], "30": ["30 giờ/tuần", "Gần mức cam kết toàn thời gian."], "40": ["40 giờ/tuần", "Yêu cầu toàn thời gian."] },
  };
  const presentation = known[field]?.[value];
  return { value, label: presentation?.[0] ?? value, description: presentation?.[1] ?? `Áp dụng “${value}” cho yêu cầu này.` };
}

function optionsFromRule(field: string, options: unknown) {
  return Array.isArray(options) ? options.slice(0, 3).map((value) => optionPresentation(field, String(value))) : [];
}

function recommendedFromRule(field: string, options: { value: string }[]) {
  if (field.startsWith("skill_requirement:")) return options.some((option) => option.value === "preferred") ? "preferred" : options[0]?.value ?? null;
  const preferred: Record<string, string> = { work_mode: "flexible", experience_policy: "2", availability_min: "20", contract_type: "project_based" };
  return options.some((option) => option.value === preferred[field]) ? preferred[field] : options[0]?.value ?? null;
}

function normalizePlannedQuestion(question: PlannedQuestion): PlannedQuestion {
  const recommended = question.recommended_option && question.options.some((option) => option.value === question.recommended_option)
    ? question.recommended_option
    : question.options[0]?.value ?? null;
  return { ...question, recommended_option: recommended, options: recommended ? [...question.options].sort((left, right) => Number(right.value === recommended) - Number(left.value === recommended)) : question.options };
}

export async function refreshClarifications(jobId: string) {
  const job = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { labelMappings: { include: { taxonomyLabel: true } }, clarifications: { include: { answer: true } } },
  });
  const extraction = jobExtractionSchema.safeParse(job.extraction);
  if (!extraction.success) return [];

  const answeredFields = new Set(job.clarifications.filter((item) => item.status === "ANSWERED" || item.status === "SKIPPED").map((item) => item.field));
  const askedKeys = new Set(job.clarifications.map((item) => semanticQuestionKey(item.field, item.question)));
  const rules = buildClarificationQuestions(extraction.data, Boolean(job.labelMappings.find((mapping) => mapping.labelType === "occupation" && mapping.taxonomyLabelId))).filter((item) => !answeredFields.has(item.field));
  const fallback: PlannedQuestion[] = rules.slice(0, 3).map((item) => {
    const options = optionsFromRule(item.field, item.options);
    return {
      field: item.field,
      header: item.field.split(":")[0].replaceAll("_", " ").slice(0, 40),
      question: item.question,
      reason: item.reason,
      impact: item.impact,
      required: item.required ?? false,
      allow_custom: !Array.isArray(item.options) || item.options.length === 0 || item.options.length > 3,
      recommended_option: recommendedFromRule(item.field, options),
      options,
      information_gain: Math.min(1, item.impact / 10),
      affected_fields: [item.field],
    };
  });

  let planned = fallback;
  try {
    const agent = await planClarificationsWithAgent({
      raw_job: { title: job.rawTitle, description: job.rawDescription },
      extraction: extraction.data,
      canonical_job: { occupation: job.occupation, requiredSkills: job.requiredSkills, preferredSkills: job.preferredSkills, experienceMin: job.experienceMin, workMode: job.workMode, availabilityMin: job.availabilityMin, budgetMax: job.budgetMax, deadline: job.deadlineText, contractType: job.contractType, languages: job.languageRequirements, certifications: job.certificationRequirements },
      taxonomy_mappings: job.labelMappings.map((mapping) => ({ field: mapping.labelType, raw: mapping.rawText, interpreted: mapping.interpretedText, canonical: mapping.taxonomyLabel?.preferredName, confidence: mapping.confidence, confirmed: mapping.confirmed })),
      answered_questions: job.clarifications.filter((item) => item.answer).map((item) => ({ field: item.field, question: item.question, value: item.answer?.value, skipped: item.answer?.skipped })),
      previously_asked: job.clarifications.map((item) => ({ field: item.field, question: item.question, status: item.status })),
      allowed_fields: [...allowedFields, "detail:<specific_business_decision>"],
      rule_candidates: fallback,
    }, { actorId: job.ownerId, jobId });
    const result = agent.output;
    if (!result.done) planned = result.questions.filter((item) => fieldAllowed(item.field) && !answeredFields.has(item.field) && !askedKeys.has(semanticQuestionKey(item.field, item.question))).sort((left, right) => right.impact * right.information_gain - left.impact * left.information_gain).slice(0, 3).map(normalizePlannedQuestion);
    else planned = [];
  } catch { planned = fallback; }

  await db.$transaction(async (transaction) => {
    await transaction.clarificationQuestion.updateMany({ where: { jobId, status: "PENDING" }, data: { status: "INVALIDATED" } });
    if (planned.length) await transaction.clarificationQuestion.createMany({ data: planned.map((item, index) => ({
      jobId,
      field: item.field,
      question: item.question,
      reason: item.reason,
      impact: item.impact,
      required: item.required,
      inputType: item.options.length ? "single_choice" : /experience|availability|budget/.test(item.field) ? "number" : "text",
      options: item.options,
      dependsOn: { header: item.header, recommendedOption: item.recommended_option, allowCustom: item.allow_custom, semanticFingerprint: semanticQuestionKey(item.field, item.question), informationGain: item.information_gain, affectedFields: item.affected_fields },
      position: index + 1,
    })) });
    await transaction.job.update({ where: { id: jobId }, data: { clarificationDone: planned.length === 0, status: planned.length === 0 ? "READY_FOR_REVIEW" : "CLARIFYING" } });
  });

  return db.clarificationQuestion.findMany({ where: { jobId, status: "PENDING" }, orderBy: [{ impact: "desc" }, { position: "asc" }] });
}
