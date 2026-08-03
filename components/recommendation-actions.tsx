"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/client-api";
import { AsyncButton } from "@/components/async-button";
import { StatusToast } from "@/components/progress-panel";

export function RecommendationActions({ role, sessionId, targetJobId, targetCandidateId, position }: { role: "candidate" | "employer"; sessionId: string; targetJobId?: string; targetCandidateId?: string; position: number }) {
  const [selected, setSelected] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const actions = role === "candidate" ? [["saved", "Lưu"], ["ignored", "Bỏ qua"], ["applied", "Ứng tuyển"]] : [["shortlisted", "Shortlist"], ["rejected", "Loại"], ["interviewed", "Phỏng vấn"]];
  async function record(eventType: string) {
    setPendingAction(eventType); setError("");
    try { await fetchJson("/api/recommendations/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, sessionId, eventType, targetJobId, targetCandidateId, position }) }); setSelected(eventType); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Không thể lưu phản hồi"); }
    finally { setPendingAction(""); }
  }
  return <><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{actions.map(([eventType, label]) => <AsyncButton type="button" className={`btn btn-sm ${selected === eventType ? "btn-primary" : "btn-light"}`} pending={pendingAction === eventType} pendingLabel="Đang lưu..." disabled={Boolean(pendingAction)} onClick={() => record(eventType)} key={eventType}>{label}</AsyncButton>)}</div><StatusToast message={error} tone="error"/></>;
}
