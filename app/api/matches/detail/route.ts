import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDemoCandidate, getDemoEmployer } from "@/lib/demo-user";

const querySchema = z.object({ jobId: z.string().min(1), candidateProfileId: z.string().min(1), role: z.enum(["candidate", "employer"]) });

export async function GET(request: NextRequest) {
  try {
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    if (input.role === "candidate") {
      const { profile } = await getDemoCandidate();
      if (profile.id !== input.candidateProfileId) return NextResponse.json({ data: null, errors: [{ code: "FORBIDDEN", message: "Không được xem matching này" }], requestId: crypto.randomUUID() }, { status: 403 });
    } else {
      const employer = await getDemoEmployer();
      const owned = await db.job.findFirst({ where: { id: input.jobId, ownerId: employer.id }, select: { id: true } });
      if (!owned) return NextResponse.json({ data: null, errors: [{ code: "FORBIDDEN", message: "Không được xem matching này" }], requestId: crypto.randomUUID() }, { status: 403 });
    }
    const match = await db.matchResult.findUnique({ where: { jobId_candidateProfileId: { jobId: input.jobId, candidateProfileId: input.candidateProfileId } } });
    return NextResponse.json({ data: match, errors: match ? [] : [{ code: "NOT_FOUND", message: "Matching chưa được tính" }], requestId: crypto.randomUUID() }, { status: match ? 200 : 404 });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "MATCH_DETAIL_FAILED", message: error instanceof Error ? error.message : String(error) }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
