import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordRecommendationEvent } from "@/lib/recommendation-engine";
import { getDemoCandidate, getDemoEmployer } from "@/lib/demo-user";
import { db } from "@/lib/db";

const schema = z.object({ role: z.enum(["candidate", "employer"]), sessionId: z.string().optional(), eventType: z.string(), targetJobId: z.string().optional(), targetCandidateId: z.string().optional(), position: z.number().int().positive().optional() });

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json()); const actor = input.role === "candidate" ? (await getDemoCandidate()).user : await getDemoEmployer();
    let targetJobId = input.targetJobId;
    if (input.role === "employer") {
      const session = input.sessionId ? await db.recommendationSession.findFirst({ where: { id: input.sessionId, actorId: actor.id, kind: "CANDIDATES_FOR_JOB" }, select: { queryEntityId: true } }) : null;
      targetJobId ??= session?.queryEntityId;
      if (!targetJobId || !input.targetCandidateId) throw new Error("INVALID_EMPLOYER_RECOMMENDATION_TARGET");
      const ownedJob = await db.job.findFirst({ where: { id: targetJobId, ownerId: actor.id }, select: { id: true } });
      if (!ownedJob) throw new Error("FORBIDDEN_JOB");
      const status = { shortlisted: "SHORTLISTED", interviewed: "INTERVIEW", rejected: "REJECTED" }[input.eventType];
      if (status) {
        const existing = await db.application.findUnique({ where: { jobId_candidateProfileId: { jobId: targetJobId, candidateProfileId: input.targetCandidateId } } });
        const application = await db.application.upsert({
          where: { jobId_candidateProfileId: { jobId: targetJobId, candidateProfileId: input.targetCandidateId } },
          update: { status },
          create: { jobId: targetJobId, candidateProfileId: input.targetCandidateId, status, coverNote: "Ứng viên được nhà tuyển dụng tìm thấy từ hệ thống đề xuất." },
        });
        await db.applicationEvent.create({ data: { applicationId: application.id, fromStatus: existing?.status, toStatus: status, actorRole: "EMPLOYER", note: "Cập nhật từ danh sách ứng viên phù hợp" } });
      }
    }
    const event = await recordRecommendationEvent({ actorId: actor.id, sessionId: input.sessionId, eventType: input.eventType, targetJobId, targetCandidateId: input.targetCandidateId, position: input.position });
    return NextResponse.json({ data: event, errors: [], requestId: crypto.randomUUID() });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "RECOMMENDATION_FEEDBACK_FAILED", message: error instanceof Error ? error.message : "Unknown error" }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
