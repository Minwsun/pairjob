"use client";

import { useCallback, useRef, useState } from "react";
import type { ProgressEvent } from "@/lib/progress";

export function useProgressAction<T>() {
  const [events, setEvents] = useState<ProgressEvent<T>[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const run = useCallback(async (url: string, init: RequestInit = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true); setError(""); setEvents([]);
    try {
      const response = await fetch(url, { ...init, headers: { ...init.headers, Accept: "text/event-stream" }, signal: controller.signal });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !response.body || !contentType.includes("text/event-stream")) {
        const text = await response.text();
        let message = `HTTP ${response.status}`;
        if (contentType.includes("application/json")) {
          try { const payload = JSON.parse(text); message = payload.errors?.[0]?.message ?? message; } catch {}
        } else if (text && !text.trimStart().startsWith("<!DOCTYPE")) message = text.slice(0, 300);
        throw new Error(message);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalData: T | undefined;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const line = block.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as ProgressEvent<T>;
          if (event.type !== "heartbeat") setEvents((current) => [...current, event]);
          if (event.type === "failed") throw new Error(event.message ?? "Tác vụ thất bại");
          if (event.type === "succeeded") finalData = event.data;
        }
      }
      if (finalData === undefined) throw new Error("Luồng kết thúc nhưng thiếu kết quả");
      return finalData;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown error";
      if (message !== "This operation was aborted") setError(message);
      throw caught;
    } finally { setPending(false); }
  }, []);
  return { run, events, pending, error, abort: () => abortRef.current?.abort(), reset: () => { setEvents([]); setError(""); } };
}
