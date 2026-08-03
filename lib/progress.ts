export type ProgressEvent<T = unknown> = {
  type: "started" | "stage_started" | "stage_completed" | "succeeded" | "failed" | "heartbeat";
  operationId: string;
  flow: string;
  stage: string;
  label: string;
  progress: number;
  message?: string;
  retryable?: boolean;
  runId?: string;
  errorCode?: string;
  timestamp: string;
  data?: T;
};

export type ProgressReporter = (event: Omit<ProgressEvent, "operationId" | "flow" | "timestamp">) => void;

export function wantsProgress(request: Request) {
  return request.headers.get("accept")?.includes("text/event-stream") ?? false;
}

export function createProgressStream<T>(flow: string, executor: (report: ProgressReporter, signal: AbortSignal) => Promise<T>, options: { operationId?: string; runId?: string } = {}) {
  const operationId = options.operationId ?? crypto.randomUUID();
  const encoder = new TextEncoder();
  const controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      const send: ProgressReporter = (event) => streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, operationId, flow, runId: options.runId, timestamp: new Date().toISOString() })}\n\n`));
      const heartbeat = setInterval(() => send({ type: "heartbeat", stage: "running", label: "Đang xử lý", progress: 0 }), 15_000);
      send({ type: "started", stage: "started", label: "Đã bắt đầu", progress: 0 });
      executor(send, controller.signal).then((data) => {
        send({ type: "succeeded", stage: "completed", label: "Hoàn tất", progress: 100, data });
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        const errorCode = message.split(":", 1)[0];
        send({ type: "failed", stage: "failed", label: "Không thể hoàn tất", progress: 100, message, errorCode, retryable: !["INVALID_FILE", "INVALID_FILE_TYPE", "INVALID_URL", "UNSAFE_URL", "FILE_TOO_LARGE"].includes(errorCode) });
      }).finally(() => {
        clearInterval(heartbeat);
        streamController.close();
      });
    },
    cancel() { controller.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
