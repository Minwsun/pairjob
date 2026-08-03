import { NextResponse } from "next/server";
import { refreshClarifications } from "@/lib/jobs/clarification-planner";
import { createProgressStream, wantsProgress, type ProgressReporter } from "@/lib/progress";

async function nextQuestions(id: string, report?: ProgressReporter) {
  report?.({ type: "stage_started", stage: "inspect", label: "Đọc câu trả lời và canonical job", progress: 10 });
  report?.({ type: "stage_completed", stage: "inspect", label: "Đã nạp ngữ cảnh làm rõ", progress: 25 });
  report?.({ type: "stage_started", stage: "plan", label: "AI đang chọn câu hỏi có giá trị nhất", progress: 35 });
  const questions = await refreshClarifications(id);
  report?.({ type: "stage_completed", stage: "plan", label: "Đã lập vòng câu hỏi tiếp theo", progress: 88, message: questions.length ? `${questions.length} câu hỏi` : "Yêu cầu đã đủ rõ" });
  return { questions, remainingEstimate: questions.length, canFinish: questions.length === 0 };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (wantsProgress(request)) return createProgressStream("job_clarification", (report) => nextQuestions(id, report));
  try { return NextResponse.json({ data: await nextQuestions(id), errors: [], requestId: crypto.randomUUID() }); }
  catch (error) { return NextResponse.json({ data: null, errors: [{ code: "CLARIFICATION_AI_FAILED", message: error instanceof Error ? error.message : "Unknown error", retryable: true }], requestId: crypto.randomUUID() }, { status: 502 }); }
}
