import { NextRequest, NextResponse } from "next/server";
import { extractCandidate } from "@/lib/candidates/extract-service";
import { createProgressStream, wantsProgress } from "@/lib/progress";
import { errorPayload } from "@/lib/errors";
import { after } from "next/server";
import { createCandidateDraft } from "@/lib/candidates/draft-service";
import { createPipelineProgressReporter, createPipelineRun, completePipelineRun } from "@/lib/pipeline-run";
import { getDemoCandidate } from "@/lib/demo-user";
import { ensureFastCandidateClarifications } from "@/lib/candidates/clarification-planner";

export const maxDuration = 20;

export async function POST(request: NextRequest) {
  try {
    const { documentId, deadlineAt } = await request.json();
    const draft = await createCandidateDraft(documentId);
    const operationId = crypto.randomUUID();
    const { user } = await getDemoCandidate();
    const run = await createPipelineRun({ operationId, actorId: user.id, flow: "candidate_enrichment", documentId, metadata: { changedSections: draft.changedSections, reusedSections: draft.reusedSections, draftProfileVersion: draft.profile.profileVersion } });
    await ensureFastCandidateClarifications(draft.profile.id);
    const hasAiBudget = draft.needsEnrichment && (typeof deadlineAt !== "number" || deadlineAt - Date.now() >= 5_000);
    if (hasAiBudget) after(async () => {
      const progress = createPipelineProgressReporter(run.id);
      try {
        await extractCandidate(documentId, progress.report, draft.profile.profileVersion);
        await progress.flush();
        await ensureFastCandidateClarifications(draft.profile.id);
        await completePipelineRun(run.id, documentId);
      } catch (error) {
        await progress.flush().catch(() => undefined);
        await ensureFastCandidateClarifications(draft.profile.id);
        await completePipelineRun(run.id, documentId);
      }
    }); else await completePipelineRun(run.id, documentId);
    const data = { ...draft.profile, draft: hasAiBudget, runId: run.id, enrichmentStatus: hasAiBudget ? "queued" : "completed", completionMode: hasAiBudget ? "pending_ai" : draft.needsEnrichment ? "best_effort" : "cache", changedSections: draft.changedSections, reusedSections: draft.reusedSections, llmCallPlanned: hasAiBudget, estimatedPromptChars: hasAiBudget ? 4000 : 0, model: hasAiBudget ? "cx/gpt-5.6-terra" : null, maxToolCalls: 0 };
    if (wantsProgress(request)) return createProgressStream("candidate_extraction", async (report) => { report({ type: "stage_completed", stage: "draft", label: "Hồ sơ tạm đã sẵn sàng", progress: 98, message: draft.needsEnrichment ? "AI xác minh nền, không chặn thao tác" : "Đã dùng kết quả cache" }); return data; }, { operationId, runId: run.id });
    return NextResponse.json({ data, errors: [], requestId: operationId }, { status: 202 });
  } catch (error) { const result = errorPayload(error, "CV_EXTRACTION_FAILED", "extract"); return NextResponse.json(result.body, { status: result.status }); }
}
