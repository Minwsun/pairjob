import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { profile } = await getDemoCandidate();
  const task = await db.recomputeTask.findFirst({ where: { id, candidateProfileId: profile.id } });
  return NextResponse.json({ data: task, errors: task ? [] : [{ code: "NOT_FOUND", message: "Không tìm thấy tác vụ" }], requestId: crypto.randomUUID() }, { status: task ? 200 : 404 });
}
