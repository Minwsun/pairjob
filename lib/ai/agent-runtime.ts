import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateStructured, modelFor, type ModelTier } from "@/lib/ai/client";

export type AgentBudgetClass = "light" | "candidate" | "standard" | "deep";
export type AgentTool = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  execute: (input: unknown) => Promise<unknown>;
};

const actionSchema = z.object({
  action: z.enum(["CALL_TOOL", "REPLAN", "FINAL_OUTPUT"]),
  tool_name: z.string().nullable().default(null),
  arguments: z.record(z.string(), z.unknown()).default({}),
  final_output: z.unknown().nullable().default(null),
  reasoning: z.string().min(1).max(1200),
  unresolved_risks: z.array(z.string()).max(12).default([]),
});

type AgentAction = z.infer<typeof actionSchema>;
type AgentActionGenerator = (system: string, input: unknown, tier: ModelTier) => Promise<AgentAction>;
type AgentFinalGenerator = <T>(system: string, input: unknown, schema: z.ZodType<T>, tier: ModelTier) => Promise<T>;

const budgets: Record<AgentBudgetClass, { maxSteps: number; maxDurationMs: number }> = {
  light: { maxSteps: 4, maxDurationMs: 20_000 },
  candidate: { maxSteps: 6, maxDurationMs: 90_000 },
  standard: { maxSteps: 8, maxDurationMs: 60_000 },
  deep: { maxSteps: 14, maxDurationMs: 150_000 },
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export type AgentRequest<T> = {
  skill: string;
  skillVersion: string;
  system: string;
  input: unknown;
  outputSchema: z.ZodType<T>;
  tools: AgentTool[];
  actorId?: string;
  budgetClass?: AgentBudgetClass;
  tier?: ModelTier;
  memoryScopes?: { scope: string; scopeId: string; kinds?: string[] }[];
  persist?: boolean;
  maxToolCalls?: number;
  minToolCalls?: number;
  attemptsPerStep?: number;
  generateAction?: AgentActionGenerator;
  generateFinal?: AgentFinalGenerator;
};

export type AgentRunResult<T> = {
  output: T;
  runId: string | null;
  steps: number;
  toolsUsed: string[];
  confidence: number;
  unresolvedRisks: string[];
  model: string;
};

export async function runAgent<T>(request: AgentRequest<T>): Promise<AgentRunResult<T>> {
  const budgetClass = request.budgetClass ?? "standard";
  const budget = budgets[budgetClass];
  const tier = request.tier ?? "reasoning";
  const model = modelFor(tier);
  const persist = request.persist !== false;
  const toolMap = new Map(request.tools.map((tool) => [tool.name, tool]));
  const memories = request.memoryScopes?.length ? await db.agentMemory.findMany({
    where: {
      supersededBy: null,
      AND: [
        { OR: request.memoryScopes.map((scope) => ({ scope: scope.scope, scopeId: scope.scopeId, ...(scope.kinds?.length ? { kind: { in: scope.kinds } } : {}) })) },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      ],
    },
    orderBy: [{ confidence: "desc" }, { usageCount: "desc" }],
    take: 20,
  }) : [];
  const run = persist ? await db.agentRun.create({ data: { actorId: request.actorId, skill: request.skill, skillVersion: request.skillVersion, modelRoute: `${tier}:${model}`, budgetClass, maxSteps: budget.maxSteps, input: json(request.input) } }) : null;
  const history: unknown[] = [];
  const toolsUsed: string[] = [];
  const startedAt = Date.now();
  const generateAction = request.generateAction ?? ((system, input, selectedTier) => generateStructured(system, input, actionSchema, selectedTier, { attempts: request.attemptsPerStep ?? 2 }));
  const generateFinal = request.generateFinal ?? ((system, input, schema, selectedTier) => generateStructured(system, input, schema, selectedTier, { attempts: request.attemptsPerStep ?? 2 }));
  const system = `${request.system}\nBạn đang chạy trong domain agent runtime. Được phép tự lập kế hoạch, gọi công cụ nhiều bước, kiểm tra kết quả rồi đổi chiến lược. Không được bịa tool hoặc tự ghi dữ liệu ngoài tool. Chỉ FINAL_OUTPUT khi kết quả đủ schema và có căn cứ.\nCông cụ:\n${request.tools.map((tool) => `- ${tool.name}: ${tool.description}\n  arguments_schema=${JSON.stringify(z.toJSONSchema(tool.inputSchema))}\n  result_schema=${JSON.stringify(z.toJSONSchema(tool.outputSchema))}`).join("\n")}\nfinal_output_schema=${JSON.stringify(z.toJSONSchema(request.outputSchema))}\nMỗi bước trả đúng JSON: {\"action\":\"CALL_TOOL|REPLAN|FINAL_OUTPUT\",\"tool_name\":string|null,\"arguments\":object,\"final_output\":object|null,\"reasoning\":string,\"unresolved_risks\":string[]}.`;

  try {
    for (let position = 1; position <= budget.maxSteps; position++) {
      if (Date.now() - startedAt > budget.maxDurationMs) throw new Error("AGENT_TIME_BUDGET_EXCEEDED");
      const stepStartedAt = Date.now();
      const action = await generateAction(system, { task_input: request.input, memories: memories.map((memory) => ({ kind: memory.kind, content: memory.content, confidence: memory.confidence })), history, remaining_steps: budget.maxSteps - position + 1 }, tier);
      let result: unknown = null;
      let error: string | null = null;
      if (action.action === "FINAL_OUTPUT") {
        if (toolsUsed.length < (request.minToolCalls ?? 0)) {
          history.push({ action, error: "MINIMUM_TOOL_CALLS_NOT_MET", instruction: "Gọi công cụ cần thiết để xác minh evidence trước FINAL_OUTPUT." });
          continue;
        }
        const parsed = request.outputSchema.safeParse(action.final_output);
        if (parsed.success) {
          if (persist && run) {
            await db.agentStep.create({ data: { runId: run.id, position, action: action.action, reasoning: action.reasoning, result: json(parsed.data), latencyMs: Date.now() - stepStartedAt, model } });
            await db.agentRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", output: json(parsed.data), unresolvedRisks: json(action.unresolved_risks), completedAt: new Date() } });
          }
          return { output: parsed.data, runId: run?.id ?? null, steps: position, toolsUsed: [...new Set(toolsUsed)], confidence: Math.max(0, 1 - action.unresolved_risks.length * .08), unresolvedRisks: action.unresolved_risks, model };
        }
        error = `FINAL_OUTPUT_INVALID:${parsed.error.message}`;
        history.push({ action, error });
      } else if (action.action === "CALL_TOOL") {
        if (toolsUsed.length >= (request.maxToolCalls ?? Number.POSITIVE_INFINITY)) {
          history.push({ action, error: "TOOL_CALL_BUDGET_EXCEEDED", instruction: "Trả FINAL_OUTPUT từ evidence đã thu thập." });
          continue;
        }
        const tool = action.tool_name ? toolMap.get(action.tool_name) : null;
        if (!tool) {
          error = `UNKNOWN_TOOL:${action.tool_name ?? "missing"}`;
        } else {
          const argumentsResult = tool.inputSchema.safeParse(action.arguments);
          if (!argumentsResult.success) error = `TOOL_ARGUMENTS_INVALID:${argumentsResult.error.message}`;
          else {
            try {
              const rawResult = await tool.execute(argumentsResult.data);
              result = tool.outputSchema.parse(rawResult);
              toolsUsed.push(tool.name);
            } catch (toolError) {
              error = `TOOL_FAILED:${toolError instanceof Error ? toolError.message : String(toolError)}`;
            }
          }
        }
        history.push({ action, tool_result: result, error });
      } else {
        history.push({ action, note: "Agent requested replanning." });
      }
      if (persist && run) await db.agentStep.create({ data: { runId: run.id, position, action: action.action, toolName: action.tool_name, arguments: json(action.arguments), result: result === null ? undefined : json(result), reasoning: action.reasoning, error, latencyMs: Date.now() - stepStartedAt, model } });
    }
    const finalStartedAt = Date.now();
    const output = await generateFinal(`${request.system}\nTổng hợp kết quả cuối cùng đúng schema. Không gọi thêm công cụ. Không trả action wrapper.`, { task_input: request.input, memories: memories.map((memory) => ({ kind: memory.kind, content: memory.content, confidence: memory.confidence })), history, tools_used: [...new Set(toolsUsed)] }, request.outputSchema, tier);
    const unresolvedRisks = ["Agent exhausted tool-step budget; final output synthesized from collected evidence."];
    if (persist && run) {
      await db.agentStep.create({ data: { runId: run.id, position: budget.maxSteps + 1, action: "FINAL_OUTPUT", reasoning: "Budget-safe final synthesis.", result: json(output), latencyMs: Date.now() - finalStartedAt, model } });
      await db.agentRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", output: json(output), unresolvedRisks: json(unresolvedRisks), completedAt: new Date() } });
    }
    return { output, runId: run?.id ?? null, steps: budget.maxSteps, toolsUsed: [...new Set(toolsUsed)], confidence: .84, unresolvedRisks, model };
  } catch (error) {
    if (persist && run) await db.agentRun.update({ where: { id: run.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : String(error), completedAt: new Date() } });
    throw error;
  }
}

export async function writeAgentMemory(input: { scope: string; scopeId: string; kind: string; fingerprint: string; content: unknown; confidence: number; provenance?: unknown; expiresAt?: Date }) {
  return db.agentMemory.upsert({
    where: { scope_scopeId_kind_fingerprint: { scope: input.scope, scopeId: input.scopeId, kind: input.kind, fingerprint: input.fingerprint } },
    update: { content: json(input.content), confidence: Math.max(0, Math.min(1, input.confidence)), provenance: input.provenance === undefined ? undefined : json(input.provenance), expiresAt: input.expiresAt, usageCount: { increment: 1 } },
    create: { scope: input.scope, scopeId: input.scopeId, kind: input.kind, fingerprint: input.fingerprint, content: json(input.content), confidence: Math.max(0, Math.min(1, input.confidence)), provenance: input.provenance === undefined ? undefined : json(input.provenance), expiresAt: input.expiresAt },
  });
}
