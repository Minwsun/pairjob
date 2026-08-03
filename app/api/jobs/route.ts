import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDemoEmployer } from "@/lib/demo-user";

const inputSchema = z.object({ rawTitle: z.string().min(5).max(160), rawDescription: z.string().min(20).max(20_000) });

export async function GET(request: NextRequest) {
  const employer = await getDemoEmployer();
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? 30)));
  const where = { ownerId: employer.id };
  const [data, total] = await Promise.all([
    db.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, rawTitle: true, displayTitle: true, company: true, occupation: true, requiredSkills: true, preferredSkills: true, experienceMin: true, workMode: true, contractType: true, locationText: true, budgetMin: true, budgetMax: true, currency: true, compensationPeriod: true, deadlineText: true, completeness: true, confirmed: true, published: true, status: true, createdAt: true, updatedAt: true },
    }),
    db.job.count({ where }),
  ]);
  return NextResponse.json({ data, meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) }, errors: [], requestId: crypto.randomUUID() }, { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } });
}

export async function POST(request: NextRequest) {
  try {
    const input = inputSchema.parse(await request.json()); const employer = await getDemoEmployer();
    const job = await db.job.create({ data: { ownerId: employer.id, rawTitle: input.rawTitle, rawDescription: input.rawDescription, displayTitle: input.rawTitle, company: employer.displayName } });
    return NextResponse.json({ data: job, errors: [], requestId: crypto.randomUUID() }, { status: 201 });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "INVALID_JOB", message: error instanceof Error ? error.message : "Invalid input" }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
