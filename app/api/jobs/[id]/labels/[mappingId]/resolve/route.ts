import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { findTaxonomyCandidates } from "@/lib/taxonomy/service";
import { syncCanonicalJob } from "@/lib/jobs/sync";
import { resolveTaxonomyConcept } from "@/lib/taxonomy/semantic-resolver";

const inputSchema = z.object({ labelId: z.string().optional(), createName: z.string().min(2).max(100).optional() }).refine((input) => Boolean(input.labelId) !== Boolean(input.createName));

export async function GET(_: Request, context: { params: Promise<{ id: string; mappingId: string }> }) {
  const { id, mappingId } = await context.params;
  const mapping = await db.jobLabelMapping.findFirstOrThrow({ where: { id: mappingId, jobId: id } });
  const candidates = await findTaxonomyCandidates(mapping.interpretedText ?? mapping.rawText, mapping.labelType);
  return NextResponse.json({ data: candidates.map((candidate) => ({ id: candidate.label.id, name: candidate.label.preferredName, confidence: candidate.confidence, method: candidate.method })), errors: [], requestId: crypto.randomUUID() });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; mappingId: string }> }) {
  try {
    const { id, mappingId } = await context.params; const input = inputSchema.parse(await request.json());
    const mapping = await db.jobLabelMapping.findFirstOrThrow({ where: { id: mappingId, jobId: id } });
    let labelId = input.labelId;
    if (input.createName) {
      labelId = (await resolveTaxonomyConcept({ rawText: input.createName, interpretedText: input.createName, type: mapping.labelType, evidence: mapping.evidence ?? undefined })).label.id;
    }
    if (!labelId) throw new Error("LABEL_REQUIRED");
    await db.$transaction(async (transaction) => {
      if (mapping.labelType === "occupation") await transaction.jobLabelMapping.updateMany({ where: { jobId: id, labelType: "occupation", mappingRole: "primary" }, data: { mappingRole: "component" } });
      await transaction.jobLabelMapping.update({ where: { id: mappingId }, data: { taxonomyLabelId: labelId, confirmed: true, method: input.createName ? "ai_auto_resolved" : "human_selected", confidence: 1, mappingRole: mapping.labelType === "occupation" ? "primary" : mapping.mappingRole } });
      if (mapping.labelType === "occupation") await transaction.clarificationQuestion.updateMany({ where: { jobId: id, field: "occupation", status: "PENDING" }, data: { status: "ANSWERED" } });
      await syncCanonicalJob(transaction, id);
    });
    return NextResponse.json({ data: await db.jobLabelMapping.findUnique({ where: { id: mappingId }, include: { taxonomyLabel: true } }), errors: [], requestId: crypto.randomUUID() });
  } catch (error) { return NextResponse.json({ data: null, errors: [{ code: "LABEL_RESOLUTION_FAILED", message: error instanceof Error ? error.message : "Unknown error" }], requestId: crypto.randomUUID() }, { status: 400 }); }
}
