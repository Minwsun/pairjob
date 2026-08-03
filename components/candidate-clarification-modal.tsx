"use client";

import { useEffect, useState } from "react";

export type CandidateQuestion = { id: string; field: string; question: string; reason: string; required: boolean; inputType: string; options: unknown; impact: number };
const optionsOf = (value: unknown) => Array.isArray(value) ? value.map((item: any) => typeof item === "string" ? { value: item, label: item, description: "" } : item) : [];

export function CandidateClarificationModal({ initial, onDone }: { initial: CandidateQuestion[]; onDone?: () => void }) {
  const [questions] = useState(initial);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const ready = questions.length > 0 && questions.every((question) => answers[question.id]?.trim());

  useEffect(() => {
    if (!ready || pending) return;
    const timeout = window.setTimeout(async () => {
      setPending(true);
      setError("");
      try {
        const response = await fetch("/api/candidate/clarifications/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: questions.map((question) => ({ questionId: question.id, value: answers[question.id], skipped: false })) }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.errors?.[0]?.message ?? "Không thể lưu câu trả lời");
        onDone?.();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setPending(false);
      }
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [answers, onDone, pending, questions, ready]);

  if (!questions.length) return null;
  return <div className="modal-backdrop"><div className="modal clarification-modal"><div className="extract-head"><span className="badge blue">AI cần làm rõ CV</span><small>{pending ? "Đang tự lưu..." : "Tự lưu sau khi trả lời đủ"}</small></div><h2>Bổ sung thông tin còn thiếu</h2><p>Hồ sơ chỉ được chấp nhận sau khi mọi thắc mắc AI được trả lời.</p><div className="clarification-list">{questions.map((question, index) => { const options = optionsOf(question.options); const numeric = question.field === "hourly_rate" || question.field === "availability_hours" || question.field.startsWith("skill_years:") || question.field.startsWith("skill_level:"); return <section className="clarification-card" key={question.id}><div className="extract-head"><small>Câu {index + 1} · tác động {question.impact}/10</small><span className={`badge ${question.required ? "red" : "blue"}`}>{question.required ? "Quan trọng" : "Cần xác nhận"}</span></div><h3>{question.question}</h3><p>{question.reason}</p>{options.length > 0 && <div className="clarification-options">{options.map((option) => <button type="button" disabled={pending} className={`choice clarification-option ${answers[question.id] === String(option.value) ? "selected" : ""}`} onClick={() => setAnswers((current) => ({ ...current, [question.id]: String(option.value) }))} key={String(option.value)}><b>{option.label}</b>{option.description && <small>{option.description}</small>}</button>)}</div>}{numeric ? <input disabled={pending} type="number" min="0" className="input" value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Nhập số" /> : <textarea disabled={pending} className="input" rows={3} value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder={options.length ? "Hoặc mô tả chi tiết..." : "Nhập câu trả lời cụ thể..."} />}</section>; })}</div>{error && <div className="ai-note" style={{ borderColor: "var(--red)", marginTop: 14 }}>{error}</div>}<div className="ai-note" style={{ marginTop: 16 }}>{pending ? "Đang cập nhật hồ sơ và matching..." : ready ? "Sẽ tự lưu sau 1,5 giây." : "Trả lời mọi câu hỏi để hoàn tất hồ sơ."}</div></div></div>;
}
