import { z } from "zod";

export type ModelTier = "reasoning" | "fast";

function config() {
  const baseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY;
  if (!baseUrl || !apiKey || apiKey.startsWith("replace-")) throw new Error("LLM_NOT_CONFIGURED");
  return { baseUrl, apiKey, reasoningModel: process.env.LLM_REASONING_MODEL ?? process.env.LLM_MODEL ?? "cx/gpt-5.6-terra", fastModel: process.env.LLM_FAST_MODEL ?? "cx/gpt-5.4-mini", effort: process.env.LLM_REASONING_EFFORT ?? "low" };
}

export function modelFor(tier: ModelTier = "reasoning") {
  const { reasoningModel, fastModel } = config();
  return tier === "fast" ? fastModel : reasoningModel;
}

function contentFrom(response: unknown) {
  const data = response as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM_EMPTY_RESPONSE");
  return content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
}

export async function generateStructured<T>(system: string, input: unknown, schema: z.ZodType<T>, tier: ModelTier = "reasoning", options: { attempts?: number; timeoutMs?: number } = {}): Promise<T> {
  const { baseUrl, apiKey, effort } = config();
  const model = modelFor(tier);
  let lastError: unknown;
  const invocationId = crypto.randomUUID();
  const startedAt = Date.now();
  const attempts = options.attempts ?? 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 120_000));
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, reasoning_effort: effort, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(attempt === 0 ? input : { task_input: input, validation_error: lastError instanceof Error ? lastError.message : String(lastError), instruction: "Sửa JSON để đúng chính xác schema trong system prompt. Không đổi nhiệm vụ." }) }] }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`LLM_HTTP_${response.status}:${(await response.text()).slice(0, 300)}`);
      const payload = await response.json() as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
      const output = schema.parse(JSON.parse(contentFrom(payload)));
      console.info(JSON.stringify({ event: "llm_invocation", invocationId, model, tier, attempt: attempt + 1, latencyMs: Date.now() - startedAt, usage: payload.usage ?? null, status: "succeeded" }));
      return output;
    } catch (error) {
      lastError = error;
      console.warn(JSON.stringify({ event: "llm_invocation", invocationId, model, tier, attempt: attempt + 1, latencyMs: Date.now() - startedAt, status: "failed", error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300) }));
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 700));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}
