import { z } from "zod";
import { db } from "@/lib/db";
import { taxonomyResolutionSchema } from "@/lib/ai/schemas";
import { runAgent, type AgentTool } from "@/lib/ai/agent-runtime";
import { findTaxonomyCandidates } from "@/lib/taxonomy/service";

const searchInput = z.object({ query: z.string().min(1), types: z.array(z.string().min(1)).min(1).max(8), limit_per_type: z.number().int().min(1).max(12).default(6) });
const searchOutput = z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), parentId: z.string().nullable(), confidence: z.number(), method: z.string() }));
const graphInput = z.object({ ids: z.array(z.string()).min(1).max(20) });
const graphOutput = z.array(z.object({ fromId: z.string(), from: z.string(), relation: z.string(), toId: z.string(), to: z.string(), confidence: z.number() }));

export async function resolveTaxonomyWithAgent(input: unknown, system: string) {
  const tools: AgentTool[] = [
    {
      name: "taxonomy_search",
      description: "Tìm toàn bộ taxonomy theo từng entity type, không giới hạn vào candidate list ban đầu. Dùng cho synonym, viết tắt, typo, parent và node tương đồng trước khi CREATE.",
      inputSchema: searchInput,
      outputSchema: searchOutput,
      execute: async (raw) => {
        const query = searchInput.parse(raw);
        const groups = await Promise.all(query.types.map((type) => findTaxonomyCandidates(query.query, type, query.limit_per_type)));
        return groups.flat().map((candidate) => ({ id: candidate.label.id, name: candidate.label.preferredName, type: candidate.label.type, parentId: candidate.label.parentId, confidence: candidate.confidence, method: candidate.method })).sort((left, right) => right.confidence - left.confidence).slice(0, 40);
      },
    },
    {
      name: "taxonomy_graph",
      description: "Đọc neighborhood thật từ DB để kiểm tra ancestor, descendant, related và duplicate path trước khi chọn hoặc tạo label.",
      inputSchema: graphInput,
      outputSchema: graphOutput,
      execute: async (raw) => {
        const { ids } = graphInput.parse(raw);
        const edges = await db.taxonomyEdge.findMany({ where: { OR: [{ fromId: { in: ids } }, { toId: { in: ids } }] }, include: { from: true, to: true }, take: 120 });
        return edges.map((edge) => ({ fromId: edge.fromId, from: edge.from.preferredName, relation: edge.relation, toId: edge.toId, to: edge.to.preferredName, confidence: edge.confidence }));
      },
    },
  ];
  return runAgent({
    skill: "resolve_taxonomy",
    skillVersion: "agent-v1",
    system: `${system}\nTrước khi CREATE, phải dùng taxonomy_search nếu candidate hiện tại không đủ rõ. Nếu có từ hai candidate gần nhau hoặc cần chọn parent, dùng taxonomy_graph. Không CREATE chỉ vì candidate list ban đầu thiếu; search toàn taxonomy trước.`,
    input,
    outputSchema: taxonomyResolutionSchema,
    tools,
    budgetClass: "deep",
    tier: "reasoning",
    memoryScopes: [{ scope: "global", scopeId: "pairjob-taxonomy", kinds: ["label_correction", "taxonomy_failure"] }],
  });
}
