import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDemoEmployer } from "@/lib/demo-user";

const schema = z.object({ status: z.enum(["REVIEWING", "SHORTLISTED", "INTERVIEWED", "REJECTED", "HIRED"]), note: z.string().max(1000).optional() });
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const input = schema.parse(await request.json()); const employer = await getDemoEmployer(); const application = await db.application.findFirst({ where: { id, job: { ownerId: employer.id } } }); if (!application) throw new Error("APPLICATION_NOT_FOUND"); const updated = await db.$transaction(async (tx) => { await tx.applicationEvent.create({ data: { applicationId: id, fromStatus: application.status, toStatus: input.status, actorRole: "EMPLOYER", note: input.note } }); return tx.application.update({ where: { id }, data: { status: input.status } }); }); return NextResponse.json({ data: updated, errors: [], requestId: crypto.randomUUID() }); }
  catch (error) { return NextResponse.json({ data: null, errors: [{ code: "APPLICATION_STATUS_FAILED", message: error instanceof Error ? error.message : String(error) }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
