import { z } from "zod";
import { clarificationToolSchema } from "@/lib/ai/schemas";
import { systemPrompts } from "@/lib/prompts";
import { runAgent, writeAgentMemory, type AgentTool } from "@/lib/ai/agent-runtime";
import { findTaxonomyCandidates } from "@/lib/taxonomy/service";
import { taxonomyNeighborhood } from "@/lib/taxonomy/semantic-resolver";
import { generateStructured, modelFor } from "@/lib/ai/client";

const taxonomySearchInput = z.object({ query: z.string().min(1), type: z.string().min(1), limit: z.number().int().min(1).max(20).default(8) });
const taxonomySearchOutput = z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), confidence: z.number(), method: z.string() }));
const neighborhoodInput = z.object({ ids: z.array(z.string()).min(1).max(12) });
const neighborhoodOutput = z.array(z.object({ from: z.string(), relation: z.string(), to: z.string(), confidence: z.number() }));

export async function planClarificationsWithAgent(input: unknown, context: { actorId: string; jobId: string }) {
  const tools: AgentTool[] = [
    {
      name: "taxonomy_search",
      description: "Tìm label canonical liên quan bằng alias, lexical, fuzzy và semantic retrieval. Dùng khi thuật ngữ JD mơ hồ, viết tắt hoặc có thể thuộc nhiều nghề/kỹ năng.",
      inputSchema: taxonomySearchInput,
      outputSchema: taxonomySearchOutput,
      execute: async (raw) => {
        const query = taxonomySearchInput.parse(raw);
        const candidates = await findTaxonomyCandidates(query.query, query.type, query.limit);
        return candidates.map((candidate) => ({ id: candidate.label.id, name: candidate.label.preferredName, type: candidate.label.type, confidence: candidate.confidence, method: candidate.method }));
      },
    },
    {
      name: "taxonomy_neighborhood",
      description: "Đọc quan hệ graph quanh các label để phân biệt broader, narrower, related, requires và transferable trước khi đặt câu hỏi.",
      inputSchema: neighborhoodInput,
      outputSchema: neighborhoodOutput,
      execute: async (raw) => taxonomyNeighborhood(neighborhoodInput.parse(raw).ids),
    },
  ];
  let result;
  try {
    const output = await generateStructured(`${systemPrompts.missingFields}\nChọn tối đa 3 câu hỏi có information gain cao nhất. Không gọi công cụ. Không hỏi lại dữ liệu đã có trong input.`, input, clarificationToolSchema, "fast");
    result = { output, runId: null, steps: 1, toolsUsed: [], confidence: .9, unresolvedRisks: [], model: modelFor("fast") };
  } catch {
    result = await runAgent({
    skill: "clarify_requirements",
    skillVersion: "agent-v1",
    system: `${systemPrompts.missingFields}\nKhông bị giới hạn bởi rule_candidates. Có thể dùng detail:<semantic_key> cho quyết định nghiệp vụ mới. Hãy gọi taxonomy tools khi viết tắt, thuật ngữ lạ hoặc mapping chưa chắc chắn. Không hỏi lại nội dung đã trả lời. Mỗi vòng trả tối đa 3 câu có information gain cao nhất.`,
    input,
    outputSchema: clarificationToolSchema,
    tools,
    actorId: context.actorId,
    budgetClass: "standard",
    tier: "reasoning",
    memoryScopes: [{ scope: "employer", scopeId: context.actorId, kinds: ["clarification_trajectory", "label_correction"] }],
    });
  }
  if (!result.output.done && result.output.questions.length) {
    const fingerprint = result.output.questions.map((question) => question.field).sort().join("|");
    await writeAgentMemory({ scope: "employer", scopeId: context.actorId, kind: "clarification_trajectory", fingerprint, content: { jobId: context.jobId, fields: result.output.questions.map((question) => question.field), toolsUsed: result.toolsUsed }, confidence: result.confidence, provenance: { runId: result.runId }, expiresAt: new Date(Date.now() + 90 * 86_400_000) });
  }
  return result;
}
