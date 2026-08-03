"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function AsyncButton({ pending, pendingLabel = "Đang xử lý...", children, className = "btn btn-primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pending: boolean; pendingLabel?: string; children: ReactNode }) {
  return <button {...props} className={className} disabled={pending || props.disabled} aria-busy={pending}>{pending && <span className="spinner" aria-hidden="true" />}<span>{pending ? pendingLabel : children}</span></button>;
}
