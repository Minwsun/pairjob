import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoEmployer } from "@/lib/demo-user";
import { recommendCandidates } from "@/lib/recommendation-engine";

export async function GET(request: Request) {
  try {
    const employer = await getDemoEmployer(); const id = new URL(request.url).searchParams.get("jobId");
    const job = id ? await db.job.findFirst({ where: { id, ownerId: employer.id } }) : await db.job.findFirst({ where: { ownerId: employer.id, published: true }, orderBy: { createdAt: "desc" } });
    if (!job) return NextResponse.json({ data: [], errors: [], requestId: crypto.randomUUID(), meta: { engine: "deterministic-hybrid-v8" } });
    const recommendation = await recommendCandidates(job.id);
    const matches = await db.matchResult.findMany({ where: { jobId: job.id }, orderBy: { score: "desc" }, take: 20 });
    return NextResponse.json({ data: matches, errors: [], requestId: crypto.randomUUID(), meta: { engine: "deterministic-hybrid-v8", sessionId: recommendation.sessionId, cacheStatus: recommendation.cacheStatus } });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "MATCH_FAILED", message: error instanceof Error ? error.message : "Unknown error", retryable: true }], requestId: crypto.randomUUID() }, { status: 502 }); }
}
