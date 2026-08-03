import Link from "next/link";

export function EmployerJobTabs({ jobId, active }: { jobId: string; active: "overview" | "edit" | "matches" | "applications" }) {
  const tabs = [["overview", "Tổng quan", `/employer/jobs/${jobId}`], ["edit", "Chỉnh sửa", `/employer/jobs/${jobId}/edit`], ["matches", "Ứng viên phù hợp", `/employer/jobs/${jobId}/matches`], ["applications", "Đơn ứng tuyển", `/employer/jobs/${jobId}/applications`]] as const;
  return <nav className="tags" aria-label="Điều hướng job" style={{ marginBottom: 18 }}>{tabs.map(([id, label, href]) => <Link className={`btn btn-sm ${active === id ? "btn-primary" : "btn-light"}`} href={href} prefetch={false} key={id}>{label}</Link>)}</nav>;
}
