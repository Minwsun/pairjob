export class AppError extends Error {
  constructor(public code: string, message: string, public stage: string, public retryable = false, public status = 500, public details?: unknown) {
    super(message);
  }
}

export function errorPayload(error: unknown, fallbackCode: string, stage: string, requestId = crypto.randomUUID()) {
  const appError = error instanceof AppError ? error : new AppError(fallbackCode, error instanceof Error ? error.message : String(error), stage, true, 502);
  return { body: { data: null, errors: [{ code: appError.code, stage: appError.stage, message: appError.message, retryable: appError.retryable, details: appError.details }], requestId }, status: appError.status };
}
