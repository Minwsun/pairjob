import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";
import { CANDIDATE_ENRICHMENT_TIMEOUT_MS, failStaleCandidateRun } from "@/lib/pipeline-run";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { user } = await getDemoCandidate();
  const { runId } = await context.params;
  let run = await db.pipelineRun.findFirst({ where: { id: runId, actorId: user.id }, include: { stages: { orderBy: { startedAt: "asc" } } } });
  if (!run) return NextResponse.json({ data: null, errors: [{ code: "PIPELINE_NOT_FOUND", message: "Không tìm thấy tiến trình." }], requestId: crypto.randomUUID() }, { status: 404 });
  if (await failStaleCandidateRun(run)) run = await db.pipelineRun.findFirstOrThrow({ where: { id: run.id }, include: { stages: { orderBy: { startedAt: "asc" } } } });

  const elapsedMs = (run.completedAt?.getTime() ?? Date.now()) - run.startedAt.getTime();
  const latest = run.stages.at(-1);
  return NextResponse.json({ data: {
    status: run.status,
    currentStage: run.currentStage,
    progress: run.status === "SUCCEEDED" ? 100 : latest?.progress ?? 0,
    elapsedMs,
    retryable: run.retryable,
    estimatedRemainingMs: run.status === "RUNNING" ? Math.max(0, CANDIDATE_ENRICHMENT_TIMEOUT_MS - elapsedMs) : 0,
    error: run.error,
    errorCode: run.errorCode,
    stages: run.stages,
  }, errors: [], requestId: crypto.randomUUID() });
}
