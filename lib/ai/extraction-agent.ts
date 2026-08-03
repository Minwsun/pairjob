import { z } from "zod";
import { runAgent, type AgentTool } from "@/lib/ai/agent-runtime";
import { generateStructured, modelFor } from "@/lib/ai/client";
import { findTaxonomyCandidates } from "@/lib/taxonomy/service";
import { db } from "@/lib/db";

const searchInput = z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(12).default(6) });
const searchOutput = z.array(z.object({ index: z.number().int(), snippet: z.string() }));
const verifyInput = z.object({ quote: z.string().min(1) });
const verifyOutput = z.object({ exact: z.boolean(), normalized: z.boolean(), snippet: z.string().nullable() });

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function evidenceIsGrounded(value: unknown, rawText: string) {
  const source = normalize(rawText);
  const evidence: string[] = [];
  const visit = (item: unknown) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    if (typeof record.source_text === "string") evidence.push(record.source_text);
    Object.values(record).forEach(visit);
  };
  visit(value);
  return evidence.every((quote) => {
    const normalizedQuote = normalize(quote);
    if (source.includes(normalizedQuote)) return true;
    const tokens = [...new Set(normalizedQuote.split(/[^a-z0-9+#.]+/).filter((token) => token.length > 2))];
    return tokens.length >= 3 && tokens.filter((token) => source.includes(token)).length / tokens.length >= .8;
  });
}

function sourceTools(rawText: string): AgentTool[] {
  return [
    {
      name: "source_search",
      description: "Tìm các đoạn nguồn chứa thuật ngữ hoặc ý nghĩa cần kiểm tra. Dùng trước khi kết luận trường không rõ hoặc evidence quan trọng.",
      inputSchema: searchInput,
      outputSchema: searchOutput,
      execute: async (raw) => {
        const { query, limit } = searchInput.parse(raw);
        const normalizedQuery = normalize(query);
        const paragraphs = rawText.split(/\n{2,}|(?<=[.!?])\s+/).map((text, index) => ({ text: text.trim(), index })).filter((item) => item.text);
        return paragraphs.filter((item) => normalize(item.text).includes(normalizedQuery) || normalizedQuery.split(" ").filter((token) => token.length > 2).some((token) => normalize(item.text).includes(token))).slice(0, limit).map((item) => ({ index: item.index, snippet: item.text.slice(0, 700) }));
      },
    },
    {
      name: "source_verify_quote",
      description: "Xác minh một evidence quote có thật trong raw JD/CV. Trả exact hoặc normalized match; không được dùng quote giả nếu cả hai false.",
      inputSchema: verifyInput,
      outputSchema: verifyOutput,
      execute: async (raw) => {
        const { quote } = verifyInput.parse(raw);
        const exactIndex = rawText.indexOf(quote);
        if (exactIndex >= 0) return { exact: true, normalized: true, snippet: rawText.slice(Math.max(0, exactIndex - 120), exactIndex + quote.length + 120) };
        const normalizedQuote = normalize(quote);
        const paragraph = rawText.split(/\n{2,}|(?<=[.!?])\s+/).find((item) => normalize(item).includes(normalizedQuote));
        return { exact: false, normalized: Boolean(paragraph), snippet: paragraph?.slice(0, 700) ?? null };
      },
    },
  ];
}

const sectionInput = z.object({ name: z.string().min(1) });
const sectionOutput = z.object({ name: z.string(), content: z.string().nullable() });
const taxonomyInput = z.object({ query: z.string().min(1), type: z.string().min(1), limit: z.number().int().min(1).max(8).default(5) });
const taxonomyOutput = z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), parentId: z.string().nullable(), confidence: z.number(), method: z.string() }));
const graphInput = z.object({ labelIds: z.array(z.string()).min(1).max(8) });
const graphOutput = z.array(z.object({ fromId: z.string(), from: z.string(), toId: z.string(), to: z.string(), relation: z.string(), confidence: z.number() }));

function candidateTools(rawText: string, sections: Record<string, unknown>): AgentTool[] {
  return [
    ...sourceTools(rawText),
    {
      name: "source_read_section",
      description: "Đọc đúng một section CV khi excerpt ban đầu chưa đủ. Không đọc lại section đã có đầy đủ trong input.",
      inputSchema: sectionInput,
      outputSchema: sectionOutput,
      execute: async (raw) => {
        const { name } = sectionInput.parse(raw);
        const content = typeof sections[name] === "string" ? String(sections[name]).slice(0, 3500) : null;
        return { name, content };
      },
    },
    {
      name: "taxonomy_search",
      description: "Dò label hiện có cho synonym, viết tắt, typo hoặc khái niệm nghề/kỹ năng chưa rõ. Không tự tạo label.",
      inputSchema: taxonomyInput,
      outputSchema: taxonomyOutput,
      execute: async (raw) => {
        const input = taxonomyInput.parse(raw);
        const candidates = await findTaxonomyCandidates(input.query, input.type, input.limit);
        return candidates.map((candidate) => ({ id: candidate.label.id, name: candidate.label.preferredName, type: candidate.label.type, parentId: candidate.label.parentId, confidence: candidate.confidence, method: candidate.method }));
      },
    },
    {
      name: "taxonomy_graph",
      description: "Kiểm tra quan hệ parent, child và related giữa các label đã tìm thấy.",
      inputSchema: graphInput,
      outputSchema: graphOutput,
      execute: async (raw) => {
        const { labelIds } = graphInput.parse(raw);
        const edges = await db.taxonomyEdge.findMany({ where: { status: "ACTIVE", OR: [{ fromId: { in: labelIds } }, { toId: { in: labelIds } }] }, include: { from: true, to: true }, take: 40 });
        return edges.map((edge) => ({ fromId: edge.fromId, from: edge.from.preferredName, toId: edge.toId, to: edge.to.preferredName, relation: edge.relation, confidence: edge.confidence }));
      },
    },
  ];
}

export async function extractWithAgent<T>(input: { skill: "analyze_job" | "extract_candidate"; system: string; rawText: string; context: unknown; outputSchema: z.ZodType<T>; actorId?: string; sections?: Record<string, unknown> }) {
  if (input.skill === "extract_candidate") {
    const output = await generateStructured(`${input.system}\nTrả final JSON ngay. Chỉ dùng evidence có thật trong CV. Không suy diễn skill từ chức danh.`, input.context, input.outputSchema, "reasoning", { attempts: 1, timeoutMs: 4_000 });
    if (!evidenceIsGrounded(output, input.rawText)) throw new Error("EXTRACTION_EVIDENCE_NOT_GROUNDED");
    return { output, runId: null, steps: 1, toolsUsed: [], confidence: .9, unresolvedRisks: [], model: modelFor("reasoning") };
  }
  try {
    const output = await generateStructured(input.system, input.context, input.outputSchema, "fast", { attempts: 1, timeoutMs: 25_000 });
    if (evidenceIsGrounded(output, input.rawText)) return { output, runId: null, steps: 1, toolsUsed: [], confidence: .92, unresolvedRisks: [], model: modelFor("fast") };
  } catch {}
  const output = await generateStructured(`${input.system}\nTrả đúng schema JSON. Evidence phải là đoạn có thật trong source; không suy diễn field không xuất hiện.`, input.context, input.outputSchema, "reasoning", { attempts: 1, timeoutMs: 35_000 });
  if (!evidenceIsGrounded(output, input.rawText)) throw new Error("EXTRACTION_EVIDENCE_NOT_GROUNDED");
  return { output, runId: null, steps: 1, toolsUsed: [], confidence: .88, unresolvedRisks: [], model: modelFor("reasoning") };
}
