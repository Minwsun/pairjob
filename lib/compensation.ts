import type { Compensation, CompensationPeriod } from "@/lib/types";

export const USD_TO_VND = Number(process.env.USD_TO_VND_RATE || 26_000);

export function compensationPeriod(contractType?: string | null): CompensationPeriod {
  if (/freelance|project[\s_-]?based|dự án/i.test(contractType ?? "")) return "PROJECT";
  return /full[\s_-]?time|toàn thời gian/i.test(contractType ?? "") ? "MONTH" : "HOUR";
}

export function formatCompensation(value: number | null | undefined, period: CompensationPeriod = "HOUR") {
  if (!value) return "Chưa cung cấp";
  return `${new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value)}/${period === "MONTH" ? "tháng" : period === "PROJECT" ? "dự án" : "giờ"}`;
}

export function compensationRange(compensation?: Compensation) {
  if (!compensation) return "Chưa cung cấp";
  if (!compensation.min) return formatCompensation(compensation.max, compensation.period);
  if (!compensation.max || compensation.min === compensation.max) return formatCompensation(compensation.min, compensation.period);
  const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  return `${formatter.format(compensation.min)} – ${formatter.format(compensation.max)}/${compensation.period === "MONTH" ? "tháng" : compensation.period === "PROJECT" ? "dự án" : "giờ"}`;
}
