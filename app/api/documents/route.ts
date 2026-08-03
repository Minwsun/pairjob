import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";
import { parseDocumentBuffer, parsePublicUrl } from "@/lib/documents/parser";
import { createProgressStream, wantsProgress, type ProgressReporter } from "@/lib/progress";
import { completePipelineRun, completePipelineStage, createPipelineRun, failPipelineRun, startPipelineStage } from "@/lib/pipeline-run";

const allowed = new Map([
  ["application/pdf", ".pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["text/html", ".html"],
  ["text/markdown", ".md"],
  ["text/plain", ".md"],
]);
const mimeByExtension = new Map([[".pdf", "application/pdf"], [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], [".html", "text/html"], [".htm", "text/html"], [".md", "text/markdown"]]);
const noop: ProgressReporter = () => {};

async function processDocument(request: NextRequest, runId: string, report: ProgressReporter = noop) {
  const { user } = await getDemoCandidate();
  const contentType = request.headers.get("content-type") ?? "";
  let documentId: string | undefined;
  const start = async (stage: string, label: string, progress: number, message?: string) => { report({ type: "stage_started", stage, label, progress, message }); await startPipelineStage(runId, stage, label, progress, message); };
  const complete = async (stage: string, label: string, progress: number, message?: string) => { await completePipelineStage(runId, stage, progress, message); report({ type: "stage_completed", stage, label, progress, message }); };
  try {
    await start("validate", "Kiểm tra nguồn tài liệu", 5);
    if (contentType.includes("application/json")) {
      const { url } = await request.json();
      if (typeof url !== "string" || !url.trim()) throw new Error("INVALID_URL");
      const document = await db.document.create({ data: { ownerId: user.id, sourceUrl: url.trim() } });
      documentId = document.id;
      await complete("validate", "URL hợp lệ", 15);
      await start("download", "Tải portfolio công khai", 25);
      const parsed = await parsePublicUrl(url.trim());
      await complete("download", "Đã tải và đọc nội dung", 72, `${parsed.text.length} ký tự`);
      await start("save", "Lưu tài liệu đã parse", 85);
      const saved = await db.document.update({ where: { id: document.id }, data: { rawText: parsed.text, sections: parsed.sections, parserMetadata: parsed.metadata, status: "PARSED", error: null } });
      await complete("save", "Tài liệu đã sẵn sàng", 98);
      await completePipelineRun(runId, document.id);
      return saved;
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error("INVALID_FILE");
    const extension = path.extname(file.name).toLowerCase();
    const mimeType = allowed.has(file.type) ? file.type : mimeByExtension.get(extension);
    if (!mimeType || !allowed.has(mimeType)) throw new Error("INVALID_FILE_TYPE");
    await complete("validate", "File hợp lệ", 15, `${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
    await start("store", "Lưu file nguồn", 22);
    const document = await db.document.create({ data: { ownerId: user.id, filename: file.name, mimeType } });
    documentId = document.id;
    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = await put(`uploads/${user.id}/${document.id}/source${allowed.get(mimeType)}`, buffer, { access: "private", addRandomSuffix: false });
    const storagePath = blob.pathname;
    await complete("store", "Đã lưu file nguồn", 38);
    await start("parse", "Đọc text và nhận diện section", 45);
    const parsed = await parseDocumentBuffer(buffer, mimeType);
    await complete("parse", parsed.ocrRequired ? "Cần OCR cho tài liệu scan" : "Đã parse tài liệu", 82, `${parsed.text.length} ký tự`);
    await start("save", "Lưu kết quả parser", 88);
    const status = parsed.ocrRequired ? "OCR_REQUIRED" : "PARSED";
    const saved = await db.document.update({ where: { id: document.id }, data: { storagePath, rawText: parsed.text, sections: parsed.sections, parserMetadata: parsed.metadata, status, error: parsed.ocrRequired ? "OCR_REQUIRED" : null } });
    await complete("save", "Document parser hoàn tất", 98);
    await completePipelineRun(runId, document.id);
    return saved;
  } catch (error) {
    if (documentId) await db.document.update({ where: { id: documentId }, data: { status: "FAILED", error: error instanceof Error ? error.message : String(error) } }).catch(() => undefined);
    await failPipelineRun(runId, error, documentId);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const { user } = await getDemoCandidate();
  const operationId = crypto.randomUUID();
  const run = await createPipelineRun({ operationId, actorId: user.id, flow: "document_parse" });
  if (wantsProgress(request)) return createProgressStream("document_parse", (report) => processDocument(request, run.id, report), { operationId, runId: run.id });
  try { return NextResponse.json({ data: await processDocument(request, run.id), errors: [], requestId: operationId }, { status: 201 }); }
  catch (error) { return NextResponse.json({ data: null, errors: [{ code: "DOCUMENT_PARSE_FAILED", message: error instanceof Error ? error.message : "Unknown error", retryable: true }], requestId: operationId, meta: { runId: run.id } }, { status: 400 }); }
}
