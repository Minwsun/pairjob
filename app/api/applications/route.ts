import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";

const schema = z.object({ jobId: z.string().min(1), coverNote: z.string().max(2000).optional() });
export async function POST(request: NextRequest) {
  try { const input = schema.parse(await request.json()); const { profile } = await getDemoCandidate(); const job = await db.job.findFirst({ where: { id: input.jobId, published: true } }); if (!job) throw new Error("JOB_NOT_AVAILABLE"); const application = await db.application.upsert({ where: { jobId_candidateProfileId: { jobId: job.id, candidateProfileId: profile.id } }, update: { coverNote: input.coverNote }, create: { jobId: job.id, candidateProfileId: profile.id, coverNote: input.coverNote, events: { create: { toStatus: "APPLIED", actorRole: "CANDIDATE" } } }, include: { events: true } }); return NextResponse.json({ data: application, errors: [], requestId: crypto.randomUUID() }); }
  catch (error) { return NextResponse.json({ data: null, errors: [{ code: "APPLICATION_FAILED", message: error instanceof Error ? error.message : String(error) }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
