import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recommendCandidates } from "@/lib/recommendation-engine";
import { getDemoEmployer } from "@/lib/demo-user";
import { db } from "@/lib/db";

const schema = z.object({ jobId: z.string().min(1) });
const deadline = <T,>(promise: Promise<T>) => Promise.race<T>([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("RECOMMENDATION_TIMEOUT")), Number(process.env.RECOMMENDATION_TIMEOUT_MS ?? 90_000)))]);
export async function POST(request: NextRequest) { try { const input = schema.parse(await request.json()); const employer = await getDemoEmployer(); const owned = await db.job.findFirst({ where: { id: input.jobId, ownerId: employer.id }, select: { id: true } }); if (!owned) return NextResponse.json({ data: null, errors: [{ code: "FORBIDDEN", message: "Job không thuộc tài khoản hiện tại" }], requestId: crypto.randomUUID() }, { status: 403 }); return NextResponse.json({ data: await deadline(recommendCandidates(input.jobId, true)), errors: [], requestId: crypto.randomUUID() }); } catch (error) { const message = error instanceof Error ? error.message : "Unknown error"; return NextResponse.json({ data: null, errors: [{ code: message === "RECOMMENDATION_TIMEOUT" ? "RECOMMENDATION_TIMEOUT" : "CANDIDATE_RECOMMENDATION_FAILED", message, retryable: true }], requestId: crypto.randomUUID() }, { status: message === "RECOMMENDATION_TIMEOUT" ? 504 : 502 }); } }

export async function GET(request: NextRequest) {
  try {
    const employer = await getDemoEmployer();
    const params = request.nextUrl.searchParams;
    const jobId = z.string().min(1).parse(params.get("jobId"));
    const limit = Math.max(1, Math.min(20, Number(params.get("limit")) || 8));
    const cursor = Math.max(0, Number(params.get("cursor")) || 0);
    const job = await db.job.findFirst({ where: { id: jobId, ownerId: employer.id }, select: { updatedAt: true } });
    if (!job) return NextResponse.json({ data: null, errors: [{ code: "FORBIDDEN", message: "Job không thuộc tài khoản hiện tại" }], requestId: crypto.randomUUID() }, { status: 403 });
    const session = await db.recommendationSession.findFirst({ where: { actorId: employer.id, kind: "CANDIDATES_FOR_JOB", queryEntityId: jobId, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, include: { items: { where: { candidateProfileId: { not: null }, rankAfter: { gt: cursor } }, orderBy: { rankAfter: "asc" }, take: limit + 1, include: { candidateProfile: { include: { user: true } } } } } });
    if (!session) return NextResponse.json({ data: { items: [], nextCursor: null, cacheStatus: "building", computedAt: null, sessionId: null }, errors: [], requestId: crypto.randomUUID() });
    const page = session.items.slice(0, limit);
    const items = page.flatMap((item) => item.candidateProfile ? [{ id: item.candidateProfile.id, name: item.candidateProfile.user.displayName, title: item.candidateProfile.displayTitle, occupation: item.candidateProfile.occupation, skills: Array.isArray(item.candidateProfile.skills) ? item.candidateProfile.skills.slice(0, 5) : [], experienceYears: item.candidateProfile.experienceYears, recommendationScore: item.recommendationScore, matchScore: item.matchScore, confidence: item.confidence, eligible: item.eligible, reasons: Array.isArray(item.reasons) ? item.reasons.slice(0, 2) : [], rank: item.rankAfter }] : []);
    const stale = session.queryVersion !== job.updatedAt.toISOString() || Boolean(session.staleAt && session.staleAt <= new Date());
    return NextResponse.json({ data: { items, nextCursor: session.items.length > limit ? page.at(-1)?.rankAfter ?? null : null, cacheStatus: stale ? "stale" : "fresh", computedAt: session.createdAt, sessionId: session.id }, errors: [], requestId: crypto.randomUUID() });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "CANDIDATE_RECOMMENDATION_READ_FAILED", message: error instanceof Error ? error.message : String(error) }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
