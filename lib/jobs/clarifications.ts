import type { Prisma } from "@prisma/client";

type Extraction = {
  occupation_text: string | null;
  skills_detected: { raw_name: string; requirement_type: "required" | "preferred" | "not_required" | "uncertain" | "unknown"; requirement_confidence: number; requirement_reason: string }[];
  experience_min_years: number | null;
  work_mode: string | null;
  availability_min: number | null;
  budget_max: number | null;
  deadline_text?: string | null;
  project_duration_text?: string | null;
  languages_detected: { raw_name: string; interpreted_name: string; level: string | null; required: boolean }[];
  certifications_detected: { raw_name: string; interpreted_name: string; required: boolean }[];
};

type QuestionInput = Omit<Prisma.ClarificationQuestionCreateManyInput, "jobId">;

export function buildClarificationQuestions(extracted: Extraction, occupationMapped: boolean): QuestionInput[] {
  const questions: QuestionInput[] = [];
  let position = 1;
  if (!extracted.occupation_text || !occupationMapped) questions.push({ field: "occupation", question: "Vị trí chính xác bạn muốn tuyển là gì?", reason: "Occupation quyết định nhóm ứng viên được truy xuất.", impact: 10, required: true, inputType: "occupation", options: [], position: position++ });
  for (const skill of extracted.skills_detected.filter((item) => item.requirement_type === "unknown" || item.requirement_type === "uncertain")) questions.push({ field: `skill_requirement:${skill.raw_name}`, question: `${skill.raw_name} là kỹ năng bắt buộc, ưu tiên hay không cần?`, reason: `${skill.requirement_reason} Lựa chọn này thay đổi trực tiếp matching và xếp hạng.`, impact: 10, required: true, inputType: "single_choice", options: ["required", "preferred", "not_required"], position: position++ });
  if (extracted.experience_min_years === null) questions.push({ field: "experience_policy", question: "Bạn yêu cầu ứng viên có bao nhiêu năm kinh nghiệm?", reason: "Kinh nghiệm là trường lõi trước khi publish.", impact: 9, required: true, inputType: "experience", options: ["0", "1", "2", "3", "5"], position: position++ });
  if (!extracted.work_mode) questions.push({ field: "work_mode", question: "Công việc thực hiện theo hình thức nào?", reason: "Chế độ làm việc có thể là hard constraint.", impact: 7, required: false, inputType: "single_choice", options: ["remote", "hybrid", "onsite", "flexible"], position: position++ });
  if (extracted.availability_min === null) questions.push({ field: "availability_min", question: "Ứng viên cần sẵn sàng tối thiểu bao nhiêu giờ mỗi tuần?", reason: "Availability giúp loại các hồ sơ không đáp ứng tiến độ.", impact: 6, required: false, inputType: "number", options: ["10", "20", "30", "40"], position: position++ });
  if (extracted.budget_max === null) questions.push({ field: "budget_max", question: "Ngân sách tối đa là bao nhiêu VND? Hệ thống sẽ dùng đơn vị theo loại hợp đồng: full-time theo tháng, các loại còn lại theo giờ.", reason: "Ngân sách được dùng để kiểm tra mức phù hợp tài chính.", impact: 6, required: false, inputType: "number", options: [], position: position++ });
  for (const language of extracted.languages_detected.filter((item) => item.required && !item.level)) questions.push({ field: `language_level:${language.interpreted_name}`, question: `Bạn yêu cầu trình độ ${language.interpreted_name} ở mức nào?`, reason: "Tên ngôn ngữ đã rõ nhưng mức sử dụng còn thiếu.", impact: 7, required: false, inputType: "single_choice", options: ["basic", "working", "professional", "fluent"], position: position++ });
  for (const certification of extracted.certifications_detected.filter((item) => item.required && /certificate|chứng chỉ|bằng/i.test(item.interpreted_name))) questions.push({ field: `certification_detail:${certification.interpreted_name}`, question: `Bạn cần loại hoặc mức cụ thể nào cho ${certification.interpreted_name}?`, reason: "Yêu cầu chứng chỉ đã được nhận diện nhưng chưa có loại hoặc ngưỡng cụ thể.", impact: 6, required: false, inputType: "text", options: [], position: position++ });
  if (!extracted.deadline_text && !extracted.project_duration_text) questions.push({ field: "deadline", question: "Dự kiến deadline hoặc thời lượng dự án là bao lâu?", reason: "Deadline giúp hiểu phạm vi và availability cần thiết.", impact: 5, required: false, inputType: "text", options: [], position: position++ });
  questions.push({ field: "contract_type", question: "Loại hợp tác bạn mong muốn?", reason: "Loại hợp đồng giúp recommendation phù hợp hơn.", impact: 4, required: false, inputType: "single_choice", options: ["freelance", "part_time", "full_time", "project_based"], position: position++ });
  return questions;
}
