"use client";

import type { ProgressEvent } from "@/lib/progress";

export function ProgressPanel({ events, pending, error }: { events: ProgressEvent[]; pending: boolean; error?: string }) {
  if (!events.length && !pending && !error) return null;
  const stageMap = new Map<string, ProgressEvent>();
  for (const event of events) if (event.type === "stage_started" || event.type === "stage_completed") stageMap.set(event.stage, event);
  const stages = [...stageMap.values()];
  const current = [...stages].reverse().find((event) => event.type === "stage_started");
  return <aside className="progress-panel" aria-live="polite" aria-busy={pending}><div className="progress-panel-head"><div><small>TIẾN TRÌNH THẬT</small><h3>{error ? "Tác vụ gặp lỗi" : pending ? current?.label ?? "Đang khởi tạo" : "Đã hoàn tất"}</h3></div><span className={`badge ${error ? "red" : pending ? "blue" : "green"}`}>{error ? "Lỗi" : pending ? "Đang chạy" : "Hoàn tất"}</span></div><div className="progress-track"><span style={{ width: `${error ? 100 : current?.progress ?? (pending ? 5 : 100)}%` }} /></div><div className="progress-stages">{stages.map((event, index) => <div className={`progress-stage ${event.type === "stage_completed" ? "done" : "running"}`} key={`${event.stage}-${index}`}><span>{event.type === "stage_completed" ? "✓" : <i className="spinner" />}</span><div><b>{event.label}</b>{event.message && <small>{event.message}</small>}</div></div>)}</div>{error && <div className="progress-error" role="alert">{error}</div>}</aside>;
}

export function StatusToast({ message, tone = "success" }: { message: string; tone?: "success" | "error" }) {
  return message ? <div className={`status-toast ${tone}`} role={tone === "error" ? "alert" : "status"}>{message}</div> : null;
}
