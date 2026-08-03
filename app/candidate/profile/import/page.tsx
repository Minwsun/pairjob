"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useProgressAction } from "@/lib/use-progress-action";
import { ProgressPanel } from "@/components/progress-panel";
import { CandidateClarificationModal, type CandidateQuestion } from "@/components/candidate-clarification-modal";
import type { ProgressEvent } from "@/lib/progress";

type DocumentRecord = { id: string; filename?: string; status: string };
type Skill = { id: string; label: string; level: number; evidence: unknown[] };
type Profile = { displayTitle?: string; skills?: Skill[]; experienceYears: number; completeness: number; evidenceQuality: number; draft?: boolean; runId?: string; enrichmentStatus?: string };
type PipelineStage = { stage: string; label: string; status: "RUNNING" | "SUCCEEDED" | "FAILED"; progress: number; message?: string };
type Pipeline = { status: "RUNNING" | "SUCCEEDED" | "FAILED"; currentStage?: string; progress: number; elapsedMs: number; retryable: boolean; error?: string; stages: PipelineStage[] };
type Phase = "idle" | "uploading" | "enriching" | "clarifying" | "accepted" | "failed";
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export default function ImportProfilePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [filename, setFilename] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [questions, setQuestions] = useState<CandidateQuestion[]>([]);
  const [error, setError] = useState("");
  const [pipelineEvents, setPipelineEvents] = useState<ProgressEvent[]>([]);
  const uploadProgress = useProgressAction<DocumentRecord>();
  const extraction = useProgressAction<Profile>();

  async function pendingQuestions() {
    const response = await fetch("/api/candidate/clarifications/next", { method: "GET", cache: "no-store" });
    const result = await response.json();
    const next = response.ok ? result.data.questions ?? [] : [];
    setQuestions(next);
    if (next.length) setPhase("clarifying");
    else {
      setPhase("accepted");
      window.setTimeout(() => router.replace("/candidate/profile"), 700);
    }
  }

  async function watch(runId: string, deadlineAt: number) {
    setPhase("enriching");
    for (let attempt = 0; Date.now() < deadlineAt; attempt += 1) {
      await sleep(Math.min(attempt < 4 ? 500 : 1000, Math.max(0, deadlineAt - Date.now())));
      const response = await fetch(`/api/pipeline/${runId}`, { cache: "no-store" });
      if (!response.ok) continue;
      const result = await response.json() as { data: Pipeline };
      setPipelineEvents(result.data.stages.map((stage) => ({
        type: stage.status === "RUNNING" ? "stage_started" : "stage_completed",
        operationId: runId,
        flow: "candidate_enrichment",
        stage: stage.stage,
        label: stage.label,
        progress: stage.progress,
        message: stage.message,
        timestamp: new Date().toISOString(),
      })));
      if (result.data.status === "FAILED") throw new Error(result.data.error ?? "AI không thể hoàn tất hồ sơ");
      if (result.data.status === "SUCCEEDED") {
        const profileResponse = await fetch("/api/candidate/profile", { cache: "no-store" });
        const profileResult = await profileResponse.json();
        if (profileResponse.ok) setProfile({ ...profileResult.data.profile, draft: false });
        await pendingQuestions();
        return;
      }
    }
    const profileResponse = await fetch("/api/candidate/profile", { cache: "no-store" });
    const profileResult = await profileResponse.json();
    if (profileResponse.ok) setProfile({ ...profileResult.data.profile, draft: false });
    await pendingQuestions();
  }

  async function run(file: File) {
    const deadlineAt = Date.now() + 10_000;
    setFilename(file.name);
    setError("");
    setQuestions([]);
    setPipelineEvents([]);
    try {
      setPhase("uploading");
      const form = new FormData();
      form.set("file", file);
      const document = await uploadProgress.run("/api/documents", { method: "POST", body: form });
      if (document.status !== "PARSED") throw new Error(document.status === "OCR_REQUIRED" ? "CV scan cần OCR trước khi phân tích" : "Không thể đọc CV");
      const draft = await extraction.run("/api/candidates/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: document.id, deadlineAt }) });
      setProfile(draft);
      if (draft.runId && draft.enrichmentStatus !== "completed") await watch(draft.runId, deadlineAt);
      else await pendingQuestions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xử lý CV");
      setPhase("failed");
    }
  }

  const busy = ["uploading", "enriching"].includes(phase);
  const events = phase === "enriching" && pipelineEvents.length ? pipelineEvents : extraction.events.length ? extraction.events : uploadProgress.events;
  return <AppShell role="candidate" active="Hồ sơ của tôi"><div className="page-head"><div><h1>Nộp CV</h1><p>Một lần chọn file. Hệ thống tự parse, xác minh, chuẩn hóa và hỏi phần còn thiếu.</p></div></div><ProgressPanel events={events} pending={busy} error={error || extraction.error || uploadProgress.error} />
    {phase === "idle" && <div className="card"><div className="dropzone"><div><input ref={inputRef} hidden type="file" accept=".pdf,.docx,.html,.htm,.md" onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(file); }} /><button className="btn btn-primary" onClick={() => inputRef.current?.click()}>Nộp CV</button><p>PDF, DOCX, HTML hoặc Markdown · tối đa 10 MB</p></div></div></div>}
    {phase !== "idle" && <div className="grid layout-2-1"><div className="card"><div className="card-title"><h2>{filename}</h2><span className={`badge ${phase === "accepted" ? "green" : phase === "failed" ? "red" : "blue"}`}>{phase === "uploading" ? "Đang đọc CV" : phase === "enriching" ? "Terra đang phân tích" : phase === "clarifying" ? "Cần bổ sung" : phase === "accepted" ? "Đã chấp nhận" : "Có lỗi"}</span></div>{profile && <><h3>{profile.displayTitle ?? "Đang xác định nghề nghiệp"}</h3><p>{profile.experienceYears ?? 0} năm kinh nghiệm · độ hoàn thiện {Math.round((profile.completeness ?? 0) * 100)}%</p><div className="tags">{profile.skills?.slice(0, 12).map((skill) => <span className="tag required" key={skill.id}>{skill.label} · L{skill.level}</span>)}</div></>}{busy && <div className="ai-note" style={{ marginTop: 18 }}>Không cần thao tác thêm. Trang tự cập nhật khi từng stage hoàn tất.</div>}{phase === "accepted" && <div className="ai-note" style={{ marginTop: 18 }}>Hồ sơ hoàn tất. Đang mở trang hồ sơ...</div>}{phase === "failed" && <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => inputRef.current?.click()}>Thử lại</button>}<input ref={inputRef} hidden type="file" accept=".pdf,.docx,.html,.htm,.md" onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(file); }} /></div><div className="card"><h3>Evidence quality</h3><strong style={{ fontSize: 30 }}>{Math.round((profile?.evidenceQuality ?? 0) * 100)}%</strong><p style={{ color: "var(--muted)" }}>Hồ sơ chưa được chấp nhận khi Terra hoặc câu hỏi bắt buộc chưa hoàn tất.</p></div></div>}
    {questions.length > 0 && <CandidateClarificationModal initial={questions} onDone={() => { setQuestions([]); setPhase("accepted"); window.setTimeout(() => router.replace("/candidate/profile"), 700); }} />}
  </AppShell>;
}
