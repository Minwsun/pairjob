"use client";

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();
  let body: T & { errors?: { message?: string }[] };
  try {
    body = JSON.parse(text) as T & { errors?: { message?: string }[] };
  } catch {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 160) || "Empty response"}`);
  }
  if (!response.ok) throw new Error(body.errors?.[0]?.message ?? `HTTP ${response.status}`);
  return body;
}

