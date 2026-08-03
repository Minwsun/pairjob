import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { ProgressReporter } from "@/lib/progress";

export const CANDIDATE_ENRICHMENT_TIMEOUT_MS = 10_000;

export async function createPipelineRun(input: { operationId: string; actorId: string; flow: string; documentId?: string; metadata?: Prisma.InputJsonValue }) {
  return db.pipelineRun.create({ data: input });
}

export async function startPipelineStage(runId: string, stage: string, label: string, progress: number, message?: string) {
  await db.pipelineRun.update({ where: { id: runId }, data: { currentStage: stage } });
  return db.pipelineStage.create({ data: { runId, stage, label, progress, message } });
}

export async function completePipelineStage(runId: string, stage: string, progress: number, message?: string) {
  const current = await db.pipelineStage.findFirst({ where: { runId, stage, status: "RUNNING" }, orderBy: { startedAt: "desc" } });
  if (current) await db.pipelineStage.update({ where: { id: current.id }, data: { status: "SUCCEEDED", progress, message, completedAt: new Date() } });
}

export async function completePipelineRun(runId: string, documentId?: string) {
  return db.pipelineRun.update({ where: { id: runId }, data: { status: "SUCCEEDED", currentStage: "completed", documentId, completedAt: new Date() } });
}

export async function failPipelineRun(runId: string, error: unknown, documentId?: string) {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.split(":", 1)[0] || "PIPELINE_FAILED";
  await db.pipelineStage.updateMany({ where: { runId, status: "RUNNING" }, data: { status: "FAILED", error: message, completedAt: new Date() } });
  return db.pipelineRun.update({ where: { id: runId }, data: { status: "FAILED", errorCode: code, error: message, retryable: !["INVALID_FILE", "INVALID_FILE_TYPE", "INVALID_URL", "UNSAFE_URL", "FILE_TOO_LARGE"].includes(code), documentId, completedAt: new Date() } });
}

export function createPipelineProgressReporter(runId: string) {
  let pending = Promise.resolve();
  const report: ProgressReporter = (event) => {
    if (event.type !== "stage_started" && event.type !== "stage_completed") return;
    pending = pending.then(async () => {
      if (event.type === "stage_started") await startPipelineStage(runId, event.stage, event.label, event.progress, event.message);
      else await completePipelineStage(runId, event.stage, event.progress, event.message);
    });
  };
  return { report, flush: () => pending };
}

export async function failStaleCandidateRun(run: { id: string; flow: string; status: string; startedAt: Date; documentId: string | null }) {
  if (run.flow !== "candidate_enrichment" || run.status !== "RUNNING" || Date.now() - run.startedAt.getTime() <= CANDIDATE_ENRICHMENT_TIMEOUT_MS) return false;
  await db.pipelineStage.updateMany({ where: { runId: run.id, status: "RUNNING" }, data: { status: "SUCCEEDED", message: "Đã chốt hồ sơ tốt nhất trong giới hạn 10 giây", completedAt: new Date() } });
  await completePipelineRun(run.id, run.documentId ?? undefined);
  return true;
}
