import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recommendJobs } from "@/lib/recommendation-engine";
import { getDemoCandidate } from "@/lib/demo-user";
import { db } from "@/lib/db";

const schema = z.object({ candidateProfileId: z.string().min(1) });
const deadline = <T,>(promise: Promise<T>) => Promise.race<T>([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("RECOMMENDATION_TIMEOUT")), Number(process.env.RECOMMENDATION_TIMEOUT_MS ?? 90_000)))]);
export async function POST(request: NextRequest) { try { const input = schema.parse(await request.json()); const { profile } = await getDemoCandidate(); if (profile.id !== input.candidateProfileId) return NextResponse.json({ data: null, errors: [{ code: "FORBIDDEN", message: "Profile không thuộc tài khoản hiện tại" }], requestId: crypto.randomUUID() }, { status: 403 }); return NextResponse.json({ data: await deadline(recommendJobs(input.candidateProfileId, true)), errors: [], requestId: crypto.randomUUID() }); } catch (error) { const message = error instanceof Error ? error.message : "Unknown error"; return NextResponse.json({ data: null, errors: [{ code: message === "RECOMMENDATION_TIMEOUT" ? "RECOMMENDATION_TIMEOUT" : "JOB_RECOMMENDATION_FAILED", message, retryable: true }], requestId: crypto.randomUUID() }, { status: message === "RECOMMENDATION_TIMEOUT" ? 504 : 502 }); } }

export async function GET(request: NextRequest) {
  try {
    const { profile } = await getDemoCandidate();
    const params = request.nextUrl.searchParams;
    const candidateProfileId = params.get("candidateProfileId") ?? profile.id;
    if (candidateProfileId !== profile.id) return NextResponse.json({ data: null, errors: [{ code: "FORBIDDEN", message: "Profile không thuộc tài khoản hiện tại" }], requestId: crypto.randomUUID() }, { status: 403 });
    const limit = Math.max(1, Math.min(20, Number(params.get("limit")) || 8));
    const cursor = Math.max(0, Number(params.get("cursor")) || 0);
    const session = await db.recommendationSession.findFirst({ where: { actorId: profile.userId, kind: "JOBS_FOR_CANDIDATE", queryEntityId: profile.id, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, include: { items: { where: { jobId: { not: null }, rankAfter: { gt: cursor } }, orderBy: { rankAfter: "asc" }, take: limit + 1, include: { job: true } } } });
    if (!session) return NextResponse.json({ data: { items: [], nextCursor: null, cacheStatus: "building", computedAt: null, sessionId: null }, errors: [], requestId: crypto.randomUUID() });
    const page = session.items.slice(0, limit);
    const items = page.flatMap((item) => item.job ? [{ id: item.job.id, title: item.job.displayTitle ?? item.job.rawTitle, company: item.job.company, occupation: item.job.occupation, requiredSkills: Array.isArray(item.job.requiredSkills) ? item.job.requiredSkills.slice(0, 5) : [], domains: Array.isArray(item.job.domains) ? item.job.domains : [], workMode: item.job.workMode, budgetMin: item.job.budgetMin, budgetMax: item.job.budgetMax, compensationPeriod: item.job.compensationPeriod, recommendationScore: item.recommendationScore, matchScore: item.matchScore, confidence: item.confidence, eligible: item.eligible, reasons: Array.isArray(item.reasons) ? item.reasons.slice(0, 2) : [], rank: item.rankAfter }] : []);
    const stale = session.queryVersion !== String(profile.profileVersion) || Boolean(session.staleAt && session.staleAt <= new Date());
    return NextResponse.json({ data: { items, nextCursor: session.items.length > limit ? page.at(-1)?.rankAfter ?? null : null, cacheStatus: stale ? "stale" : "fresh", computedAt: session.createdAt, sessionId: session.id }, errors: [], requestId: crypto.randomUUID() });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "JOB_RECOMMENDATION_READ_FAILED", message: error instanceof Error ? error.message : String(error) }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
