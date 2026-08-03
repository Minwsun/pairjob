import { NextResponse } from "next/server";
import { getDemoCandidate } from "@/lib/demo-user";
import { refreshCandidateClarifications } from "@/lib/candidates/clarification-planner";
import { createProgressStream, wantsProgress, type ProgressReporter } from "@/lib/progress";
import { db } from "@/lib/db";

export async function GET() {
  const { profile } = await getDemoCandidate();
  const questions = await db.candidateClarificationQuestion.findMany({ where: { candidateProfileId: profile.id, profileVersion: profile.profileVersion, status: "PENDING" }, orderBy: [{ impact: "desc" }, { position: "asc" }] });
  return NextResponse.json({ data: { questions, needsClarification: questions.length > 0, canFinish: questions.length === 0 }, errors: [], requestId: crypto.randomUUID() });
}

async function run(report?: ProgressReporter) {
  const { profile } = await getDemoCandidate();
  report?.({ type: "stage_started", stage: "inspect", label: "AI đang kiểm tra CV và evidence", progress: 10 });
  const questions = await refreshCandidateClarifications(profile.id);
  report?.({ type: "stage_completed", stage: "inspect", label: questions.length ? "Đã tìm thấy điểm cần làm rõ" : "Hồ sơ đã đủ rõ", progress: 92, message: questions.length ? `${questions.length} câu hỏi` : "Không cần hỏi thêm" });
  return { questions, needsClarification: questions.length > 0, canFinish: questions.length === 0 };
}

export async function POST(request: Request) {
  if (wantsProgress(request)) return createProgressStream("candidate_clarification", run);
  try { return NextResponse.json({ data: await run(), errors: [], requestId: crypto.randomUUID() }); }
  catch (error) { return NextResponse.json({ data: null, errors: [{ code: "CANDIDATE_CLARIFICATION_FAILED", message: error instanceof Error ? error.message : String(error) }], requestId: crypto.randomUUID() }, { status: 502 }); }
}
