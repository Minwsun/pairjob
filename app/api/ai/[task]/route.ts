import { NextRequest, NextResponse } from "next/server";
import { generateStructured, modelFor } from "@/lib/ai/client";
import { cvExtractionSchema, jobExtractionSchema } from "@/lib/ai/schemas";
import { systemPrompts } from "@/lib/prompts";

export async function POST(request: NextRequest, context: { params: Promise<{ task: string }> }) {
  try {
    const { task } = await context.params;
    const input = await request.json();
    const data = task === "jobExtractor"
      ? await generateStructured(systemPrompts.jobExtractor, input, jobExtractionSchema)
      : task === "cvExtractor"
        ? await generateStructured(systemPrompts.cvExtractor, input, cvExtractionSchema)
        : null;
    if (!data) return NextResponse.json({ data: null, errors: [{ code: "UNSUPPORTED_PUBLIC_AI_TASK", message: task }], requestId: crypto.randomUUID() }, { status: 404 });
    return NextResponse.json({ data, errors: [], requestId: crypto.randomUUID(), meta: { provider: "openai-compatible", model: modelFor("reasoning") } });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "AI_REQUEST_FAILED", message: error instanceof Error ? error.message : "Unknown error" }], requestId: crypto.randomUUID() }, { status: 502 }); }
}
