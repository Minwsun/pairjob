"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Stepper } from "@/components/ui";
import { fetchJson } from "@/lib/client-api";
import { useProgressAction } from "@/lib/use-progress-action";
import { AsyncButton } from "@/components/async-button";
import { ProgressPanel } from "@/components/progress-panel";

type Mapping = {
  id: string;
  rawText: string;
  interpretedText?: string;
  labelType: string;
  requirementType?: string;
  confidence: number;
  confirmed: boolean;
  mappingRole: string;
  method: string;
  derivedFrom?: { rawText: string; labelId: string }[];
  taxonomyLabelId?: string;
  taxonomyLabel?: { id: string; preferredName: string; status: string };
};

type Question = {
  id: string;
  field: string;
  question: string;
  reason: string;
  impact: number;
  required: boolean;
  inputType: string;
  options: ({ value: string; label: string; description: string } | string)[];
  dependsOn?: { header?: string; recommendedOption?: string | null; allowCustom?: boolean };
};

type JobRecord = {
  id: string;
  rawTitle: string;
  occupation?: string;
  requiredSkills?: { id: string; label: string; level: number }[];
  preferredSkills?: { id: string; label: string }[];
  domains?: string[];
  completeness?: number;
  labelMappings?: Mapping[];
  clarifications?: Question[];
};

export default function NewJobPage() {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [job, setJob] = useState<JobRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<Record<string, { id: string; name: string; confidence: number }[]>>({});
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});
  const extraction = useProgressAction<JobRecord>();
  const clarification = useProgressAction<{ questions: Question[]; canFinish: boolean }>();

  async function createAndExtract() {
    setError("");
    if (title.trim().length < 5) { setError("Tiêu đề cần ít nhất 5 ký tự."); return; }
    if (description.trim().length < 20) { setError("Mô tả yêu cầu cần ít nhất 20 ký tự để AI có đủ ngữ cảnh phân tích."); return; }
    setBusy(true);
    try {
      const created = await fetchJson<{ data: JobRecord }>("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawTitle: title, rawDescription: description }) });
      const extracted = await extraction.run(`/api/jobs/${created.data.id}/extract`, { method: "POST" });
      setJob(extracted); setStep(2);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unknown error"); }
    finally { setBusy(false); }
  }

  async function loadCandidates(mapping: Mapping) {
    const result = await fetchJson<{ data: { id: string; name: string; confidence: number }[] }>(`/api/jobs/${job!.id}/labels/${mapping.id}/resolve`);
    setCandidates((current) => ({ ...current, [mapping.id]: result.data }));
  }

  async function resolveMapping(mapping: Mapping, input: { labelId?: string; createName?: string }) {
    setBusy(true); setError("");
    try {
      const result = await fetchJson<{ data: Mapping }>(`/api/jobs/${job!.id}/labels/${mapping.id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      setJob((current) => current ? { ...current, labelMappings: current.labelMappings?.map((item) => item.id === mapping.id ? result.data : item) } : current);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unknown error"); }
    finally { setBusy(false); }
  }

  async function startClarification() {
    setBusy(true); setError("");
    try {
      const result = await clarification.run(`/api/jobs/${job!.id}/clarifications/next`, { method: "POST" });
      if (result.canFinish) { setStep(3); return; }
      setQuestions(result.questions); setAnswers({});
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unknown error"); }
    finally { setBusy(false); }
  }

  async function submitAnswers() {
    if (!questions.length) return;
    setBusy(true); setError("");
    try {
      for (const question of questions) {
        const value = answers[question.id]?.trim();
        await fetchJson(`/api/jobs/${job!.id}/clarifications/${question.id}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: value || undefined, skipped: !value }) });
      }
      const next = await clarification.run(`/api/jobs/${job!.id}/clarifications/next`, { method: "POST" });
      if (next.canFinish) { setQuestions([]); setStep(3); }
      else { setQuestions(next.questions); setAnswers({}); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unknown error"); }
    finally { setBusy(false); }
  }

  async function confirm() {
    setBusy(true); setError("");
    try { await fetchJson(`/api/jobs/${job!.id}/confirm`, { method: "POST" }); setStep(4); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unknown error"); }
    finally { setBusy(false); }
  }

  const unresolved = job?.labelMappings?.filter((mapping) => !mapping.confirmed) ?? [];

  return <AppShell role="employer" active="Tin tuyển dụng">
    <div className="page-head"><div><h1>Tạo tin tuyển dụng</h1><p>AI hiểu viết tắt, map taxonomy và hỏi lại khi yêu cầu chưa rõ.</p></div></div>
    <Stepper current={step}/><ProgressPanel events={clarification.pending||clarification.events.length?clarification.events:extraction.events} pending={extraction.pending||clarification.pending} error={clarification.error||extraction.error}/>
    {error && <div className="ai-note" style={{ borderColor: "var(--red)", marginBottom: 18 }}><b>Lỗi:</b> {error}</div>}

    {step === 1 && <div className="grid layout-2-1"><div className="card">
      <div className="field"><label className="form-label">TIÊU ĐỀ</label><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cần FE dev React, remote..."/><small style={{ color: "var(--muted)" }}>{title.trim().length}/5 ký tự tối thiểu</small></div>
      <div className="field"><label className="form-label">MÔ TẢ YÊU CẦU</label><textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Có thể viết tự nhiên hoặc dùng FE, BE, FS, JS, TS, MERN..."/><small style={{ color: "var(--muted)" }}>{description.trim().length}/20 ký tự tối thiểu</small></div>
      <AsyncButton type="button" pending={busy || extraction.pending} pendingLabel={extraction.pending ? "AI đang xử lý nhiều stage..." : "Đang tạo job..."} onClick={createAndExtract}>Phân tích yêu cầu →</AsyncButton>
    </div><div className="card"><div className="ai-note"><b>Ví dụ được hỗ trợ</b><br/>“Cần FE biết ReactJS, TS, ưu tiên Next, khoảng 2 năm KN, WFH.”</div></div></div>}

    {step === 2 && job && <div className="grid layout-2-1"><div className="card">
      <div className="card-title"><h2>AI chuẩn hóa label</h2><span className={`badge ${unresolved.length ? "amber" : "green"}`}>{unresolved.length ? `${unresolved.length} cần AI xử lý lại` : "Tự động hoàn tất"}</span></div>
      {job.labelMappings?.map((mapping) => <div className={`mapping-card ${mapping.confidence < .75 ? "low" : ""}`} key={mapping.id}>
        <div className="extract-head"><small>{mapping.labelType.toUpperCase()} · {mapping.mappingRole} · raw: “{mapping.rawText}”</small><span className={`badge ${mapping.confirmed ? "green" : mapping.confidence >= .75 ? "blue" : "amber"}`}>{mapping.confirmed ? "Tự xác nhận" : `${Math.round(mapping.confidence * 100)}%`}</span></div>
        <div className="extract-value">{mapping.taxonomyLabel?.preferredName ?? "AI chưa giải quyết được label"}{mapping.method === "composition_rule" && <span className="badge blue" style={{ marginLeft: 8 }}>Suy ra từ tổ hợp</span>}{mapping.taxonomyLabel?.status === "ACTIVE" && mapping.method.includes("ai") && <span className="badge green" style={{ marginLeft: 8 }}>AI tự duyệt</span>}</div>
        {mapping.interpretedText && mapping.interpretedText !== mapping.rawText && <div className="quote">AI hiểu: “{mapping.interpretedText}”</div>}
        {mapping.derivedFrom?.length ? <div className="quote">{mapping.derivedFrom.map((item) => item.rawText).join(" + ")} → {mapping.taxonomyLabel?.preferredName}</div> : null}
        {!mapping.confirmed && <div className="ai-note">Resolver chưa đạt semantic gate. Hãy chạy lại phân tích với thêm ngữ cảnh; không có bước duyệt thủ công.</div>}
      </div>)}
      <AsyncButton pending={busy||clarification.pending} pendingLabel="AI đang lập câu hỏi theo ngữ cảnh..." onClick={startClarification}>AI làm rõ yêu cầu →</AsyncButton>
    </div><div className="card"><h3>Nguyên tắc</h3><p style={{ color: "var(--muted)", lineHeight: 1.7 }}>Exact alias → fuzzy → semantic comparison → graph relation. AI chỉ tạo label ACTIVE khi không có concept tương đồng vượt duplicate gate.</p></div></div>}

    {step === 3 && job && <div className="grid layout-2-1"><div className="card"><div className="card-title"><h2>Sẵn sàng xác nhận</h2><span className="badge green">Đã làm rõ</span></div><p><b>{job.rawTitle}</b></p><div className="tags">{job.labelMappings?.filter((mapping) => mapping.confirmed).map((mapping) => <span className={`tag ${mapping.requirementType === "required" ? "required" : ""}`} key={mapping.id}>{mapping.taxonomyLabel?.preferredName ?? mapping.rawText}{mapping.requirementType ? ` · ${mapping.requirementType}` : ""}</span>)}</div><AsyncButton style={{ marginTop: 20 }} pending={busy} pendingLabel="Đang kiểm tra điều kiện publish..." onClick={confirm}>Xác nhận & đăng job</AsyncButton></div><div className="card"><div className="ai-note">Backend sẽ chặn publish nếu occupation, required skill hoặc chính sách kinh nghiệm chưa được xác nhận.</div></div></div>}

    {step === 4 && job && <div className="card empty"><h2>Job đã publish</h2><p>Canonical profile đã được xác nhận.</p><Link className="btn btn-primary" href={`/employer/jobs/${job.id}/matches`}>Xem ứng viên phù hợp →</Link></div>}

    {questions.length > 0 && <div className="modal-backdrop"><div className="modal clarification-modal"><div className="extract-head"><span className="badge blue">AI cần làm rõ</span><small>{questions.length} quyết định quan trọng</small></div><h2>Hoàn thiện yêu cầu tuyển dụng</h2><p>Chọn phương án phù hợp nhất. Hệ thống sẽ cập nhật hồ sơ job rồi tự quyết định có cần hỏi tiếp hay không.</p>
      <div className="clarification-list">{questions.map((question, questionIndex) => {
        const options = question.options.map((option) => typeof option === "string" ? { value: option, label: option, description: `Chọn ${option} cho yêu cầu này.` } : option);
        return <section className="clarification-card" key={question.id}><div className="extract-head"><small>{question.dependsOn?.header ?? `Câu ${questionIndex + 1}`}</small><span className={`badge ${question.required ? "red" : "blue"}`}>{question.required ? "Bắt buộc" : "Có thể bỏ qua"}</span></div><h3>{question.question}</h3><p>{question.reason}</p>
          {options.length > 0 && <div className="clarification-options">{options.map((option) => <button type="button" className={`choice clarification-option ${answers[question.id] === option.value ? "selected" : ""}`} onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.value }))} key={option.value}><b>{option.label}{question.dependsOn?.recommendedOption === option.value ? " · Khuyên dùng" : ""}</b><small>{option.description}</small></button>)}</div>}
          {(question.dependsOn?.allowCustom || options.length === 0) && <input className="input" type={question.inputType === "number" || ["availability_min", "budget_max", "experience_policy"].includes(question.field) ? "number" : "text"} value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder={options.length ? "Hoặc nhập câu trả lời khác..." : "Nhập câu trả lời..."}/>} 
        </section>})}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}><button className="btn btn-ghost" disabled={busy || clarification.pending} onClick={() => setQuestions([])}>Quay lại</button><AsyncButton pending={busy || clarification.pending} pendingLabel="Đang lưu và phân tích vòng tiếp..." disabled={questions.some((item) => item.required && !answers[item.id]?.trim())} onClick={submitAnswers}>Áp dụng & tiếp tục →</AsyncButton></div>
    </div></div>}
  </AppShell>;
}
