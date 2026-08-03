import { NextResponse } from "next/server";
import { extractJob } from "@/lib/jobs/extract-service";
import { createProgressStream, wantsProgress } from "@/lib/progress";
import { errorPayload } from "@/lib/errors";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (wantsProgress(request)) return createProgressStream("job_extraction", (report) => extractJob(id, report));
  try { return NextResponse.json({ data: await extractJob(id), errors: [], requestId: crypto.randomUUID() }); }
  catch (error) { const result = errorPayload(error, "JOB_EXTRACTION_FAILED", "extract"); return NextResponse.json(result.body, { status: result.status }); }
}
