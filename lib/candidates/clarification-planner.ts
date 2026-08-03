import { db } from "@/lib/db";
import { planCandidateClarificationsWithAgent } from "@/lib/ai/candidate-clarification-agent";

const allowedField = (field: string) => ["occupation_focus", "availability_hours", "hourly_rate", "work_modes"].includes(field) || /^(skill_confirm|skill_evidence|skill_years|skill_level|project_detail|experience_detail):.+/.test(field);
const normalizedQuestion = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function ensureFastCandidateClarifications(profileId: string) {
  const profile = await db.candidateProfile.findUniqueOrThrow({ where: { id: profileId } });
  const existing = await db.candidateClarificationQuestion.count({ where: { candidateProfileId: profile.id, profileVersion: profile.profileVersion, status: "PENDING" } });
  if (existing) return;
  const skills = Array.isArray(profile.skills) ? profile.skills as { id?: string; label?: string; evidence?: unknown[] }[] : [];
  const weakestSkill = skills.find((skill) => skill.id && (!Array.isArray(skill.evidence) || skill.evidence.length < 2));
  const questions = [
    !profile.occupation ? { field: "occupation_focus", question: "Bạn muốn tập trung ứng tuyển vị trí hoặc chuyên môn nào?", reason: "Mục tiêu nghề nghiệp giúp hệ thống chọn đúng nhóm công việc và tránh gợi ý quá rộng.", impact: 10, affectedConcepts: ["occupation", "matching"] } : null,
    weakestSkill?.id ? { field: `skill_evidence:${weakestSkill.id}`, question: `Bạn đã dùng ${weakestSkill.label ?? "kỹ năng chính"} trong dự án hoặc công việc nào, và tạo ra kết quả gì?`, reason: "Ví dụ thực tế giúp đánh giá đúng mức độ thành thạo thay vì chỉ dựa vào tên kỹ năng.", impact: 9, affectedConcepts: [weakestSkill.id, "evidence"] } : null,
    !profile.availabilityHours ? { field: "availability_hours", question: "Bạn có thể dành bao nhiêu giờ mỗi tuần cho công việc mới?", reason: "Thời lượng sẵn sàng ảnh hưởng trực tiếp tới khả năng nhận dự án và công việc phù hợp.", impact: 8, affectedConcepts: ["availability", "matching"] } : null,
    { field: "project_detail:primary", question: "Hãy mô tả một dự án tiêu biểu: vai trò của bạn, việc đã làm và kết quả đạt được.", reason: "Một dự án cụ thể giúp xác minh kinh nghiệm, kỹ năng và phạm vi trách nhiệm.", impact: 8, affectedConcepts: ["projects", "experience", "evidence"] },
  ].filter((question): question is NonNullable<typeof question> => Boolean(question)).slice(0, 3);
  while (questions.length < 2) questions.push({ field: `experience_detail:${questions.length}`, question: "Hãy bổ sung nhiệm vụ chính và kết quả đo được trong kinh nghiệm gần nhất.", reason: "Chi tiết này giúp matching hiểu đúng năng lực thực tế của bạn.", impact: 8, affectedConcepts: ["experience", "evidence"] });
  await db.candidateClarificationQuestion.createMany({ data: questions.map((question, position) => ({ candidateProfileId: profile.id, profileVersion: profile.profileVersion, field: question.field, conceptId: question.field.startsWith("skill_") ? question.field.slice(question.field.indexOf(":") + 1) : null, question: question.question, reason: question.reason, impact: question.impact, informationGain: .8, required: position < 2, inputType: question.field === "availability_hours" ? "number" : "text", options: [], affectedConcepts: question.affectedConcepts, position })) });
}

export async function refreshCandidateClarifications(profileId: string) {
  const profile = await db.candidateProfile.findUniqueOrThrow({ where: { id: profileId }, include: { user: true, conceptAssertions: { where: { active: true }, include: { taxonomyLabel: true } }, clarificationQuestions: { include: { answer: true }, orderBy: { createdAt: "asc" } } } });
  await db.candidateClarificationQuestion.updateMany({ where: { candidateProfileId: profile.id, profileVersion: { not: profile.profileVersion }, status: "PENDING" }, data: { status: "INVALIDATED" } });
  const existingPending = profile.clarificationQuestions.filter((question) => question.profileVersion === profile.profileVersion && question.status === "PENDING");
  if (existingPending.length) return existingPending;
  const jobs = await db.job.findMany({ where: { published: true }, orderBy: { publishedAt: "desc" }, take: 12, select: { displayTitle: true, occupation: true, requiredSkills: true, preferredSkills: true, domains: true } });
  const history = profile.clarificationQuestions.filter((question) => question.status !== "PENDING").map((question) => ({ field: question.field, question: question.question, status: question.status, answer: question.answer?.value ?? null }));
  const plannerInput = {
    profile: { displayTitle: profile.displayTitle, occupation: profile.occupation, skills: profile.skills, experiences: profile.experiences, projects: profile.projects, education: profile.education, experienceYears: profile.experienceYears, workModes: profile.workModes, availabilityHours: profile.availabilityHours, hourlyRate: profile.hourlyRate, completeness: profile.completeness, evidenceQuality: profile.evidenceQuality },
    assertions: profile.conceptAssertions.map((assertion) => ({ conceptId: assertion.taxonomyLabelId, concept: assertion.taxonomyLabel.preferredName, conceptType: assertion.taxonomyLabel.type, assertionType: assertion.assertionType, proficiency: assertion.proficiency, confidence: assertion.confidence, evidence: assertion.evidence })),
    relevant_jobs: jobs,
    previous_questions: history,
  };
  let result = await planCandidateClarificationsWithAgent(plannerInput, { actorId: profile.userId, profileId: profile.id });
  if (!result.output.done && result.output.questions.length < 2) result = await planCandidateClarificationsWithAgent({ ...plannerInput, rejected_previous_attempt: result.output, correction: "done=false bắt buộc có 2-3 câu khác nhau, đúng 2 câu required=true" }, { actorId: profile.userId, profileId: profile.id });
  const seen = new Set(history.map((item) => `${item.field}:${normalizedQuestion(item.question)}`));
  const skillIds = new Set((Array.isArray(profile.skills) ? profile.skills as { id?: string }[] : []).map((skill) => skill.id).filter(Boolean));
  const planned = result.output.questions.filter((question) => allowedField(question.field) && !seen.has(`${question.field}:${normalizedQuestion(question.question)}`)).slice(0, 3).map((question) => {
    let field = question.field;
    if (field.startsWith("skill_evidence:") && !skillIds.has(field.slice("skill_evidence:".length))) field = `skill_confirm:${field.slice("skill_evidence:".length)}`;
    const options = ["availability_hours", "hourly_rate", "skill_years", "skill_level"].some((prefix) => field === prefix || field.startsWith(`${prefix}:`)) ? question.options.map((option) => {
      const numbers = `${option.value} ${option.label}`.match(/\d+(?:[.,]\d+)?/g)?.map((value) => Number(value.replace(",", "."))) ?? [];
      const numericValue = numbers.length > 1 ? Math.round((numbers[0] + numbers[1]) / 2) : numbers[0];
      return Number.isFinite(numericValue) ? { ...option, value: String(numericValue) } : option;
    }) : question.options;
    return { ...question, field, options };
  });
  const normalized = planned.map((question, index) => ({ ...question, required: index < 2 }));
  if (normalized.length < 2) return [];
  await db.$transaction(async (transaction) => {
    if (normalized.length) await transaction.candidateClarificationQuestion.createMany({ data: normalized.map((question, position) => ({ candidateProfileId: profile.id, profileVersion: profile.profileVersion, field: question.field, conceptId: question.field.startsWith("skill_") ? question.field.slice(question.field.indexOf(":") + 1) : null, question: question.question, reason: question.reason, impact: question.impact, informationGain: question.information_gain, required: question.required, inputType: question.options.length ? "choice" : "text", options: question.options, affectedConcepts: question.affected_fields, position })) });
  });
  return db.candidateClarificationQuestion.findMany({ where: { candidateProfileId: profile.id, profileVersion: profile.profileVersion, status: "PENDING" }, orderBy: [{ impact: "desc" }, { position: "asc" }] });
}
