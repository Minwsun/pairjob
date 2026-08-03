import { clarificationToolSchema } from "@/lib/ai/schemas";
import { writeAgentMemory } from "@/lib/ai/agent-runtime";
import { generateStructured, modelFor } from "@/lib/ai/client";

const system = `Bạn kiểm tra độ chi tiết hồ sơ freelancer sau khi CV đã được parse và chuẩn hóa.
Chỉ hỏi điều còn thiếu hoặc mâu thuẫn có ảnh hưởng thật tới matching, evidence confidence hoặc roadmap.
Ưu tiên: skill có level nhưng thiếu evidence; công nghệ xuất hiện nhưng chưa rõ ứng viên trực tiếp dùng; vai trò trong project; số năm/timeline; occupation focus; availability/work mode/rate.
Không hỏi một skill chỉ vì nó cùng cây. Chỉ hỏi skill liên quan khi raw CV, project, experience, graph typed relation hoặc job phù hợp tạo tín hiệu cụ thể.
Field phải thuộc: occupation_focus, availability_hours, hourly_rate, work_modes, skill_confirm:<concept_id>, skill_evidence:<concept_id>, skill_years:<concept_id>, skill_level:<concept_id>, project_detail:<semantic_key>, experience_detail:<semantic_key>.
Nếu done=false, mỗi vòng bắt buộc trả 2-3 câu và đúng 2 câu có required=true. Required ưu tiên ambiguity hoặc evidence gap ảnh hưởng required-skill matching. Không có ít nhất 2 gap đáng hỏi thì done=true, không mở popup.
Không hỏi lại nội dung đã trả lời hoặc câu tương đương. Options rõ ràng, không dẫn dắt; cho phép trả lời chưa dùng hoặc chỉ biết cơ bản.`;

export async function planCandidateClarificationsWithAgent(input: unknown, context: { actorId: string; profileId: string }) {
  let result;
  const structuredSystem = `${system}\nChọn tối đa 3 câu hỏi có information gain cao nhất. Trả duy nhất JSON object gồm done:boolean, auto_confirmed:array, remaining_risks:array, questions:array.`;
  try {
    const output = await generateStructured(structuredSystem, input, clarificationToolSchema, "fast", { attempts: 1, timeoutMs: 15_000 });
    result = { output, runId: null, steps: 1, toolsUsed: [], confidence: .9, unresolvedRisks: [], model: modelFor("fast") };
  } catch {
    const output = await generateStructured(structuredSystem, input, clarificationToolSchema, "reasoning", { attempts: 1, timeoutMs: 25_000 });
    result = { output, runId: null, steps: 1, toolsUsed: [], confidence: .85, unresolvedRisks: [], model: modelFor("reasoning") };
  }
  if (!result.output.done && result.output.questions.length) {
    const fingerprint = result.output.questions.map((question) => question.field).sort().join("|");
    await writeAgentMemory({ scope: "candidate", scopeId: context.actorId, kind: "candidate_clarification_trajectory", fingerprint, content: { profileId: context.profileId, fields: result.output.questions.map((question) => question.field), toolsUsed: result.toolsUsed }, confidence: result.confidence, provenance: { runId: result.runId }, expiresAt: new Date(Date.now() + 90 * 86_400_000) });
  }
  return result;
}
