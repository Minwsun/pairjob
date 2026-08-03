import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/ui";
import { db } from "@/lib/db";
import { getDemoEmployer } from "@/lib/demo-user";

export const dynamic = "force-dynamic";
export default async function EmployerDashboard() {
  const employer = await getDemoEmployer();
  const [jobs, totalJobs, applications, failedRuns, active, shortlisted] = await Promise.all([
    db.job.findMany({ where: { ownerId: employer.id }, include: { _count: { select: { applications: true } } }, orderBy: { updatedAt: "desc" }, take: 6 }), db.job.count({ where: { ownerId: employer.id } }),
    db.application.findMany({ where: { job: { ownerId: employer.id } }, include: { job: true, candidateProfile: { include: { user: true } } }, orderBy: { updatedAt: "desc" }, take: 6 }), db.pipelineRun.count({ where: { actorId: employer.id, status: "FAILED" } }),
    db.job.count({ where: { ownerId: employer.id, published: true } }), db.application.count({ where: { job: { ownerId: employer.id }, status: { in: ["SHORTLISTED", "INTERVIEWED", "HIRED"] } } }),
  ]);
  return <AppShell role="employer"><div className="page-head"><div><h1>Chào, {employer.displayName}</h1><p>Theo dõi JD, matching và pipeline tuyển dụng.</p></div><Link className="btn btn-primary" href="/employer/jobs/new">＋ Tạo tin tuyển dụng</Link></div><div className="grid grid-4"><StatCard label="TIN ĐANG MỞ" value={String(active)} detail={`${totalJobs} tin tổng cộng`} icon="◇"/><StatCard label="ĐƠN ỨNG TUYỂN" value={String(applications.length)} detail="Hồ sơ gần đây" icon="◎"/><StatCard label="SHORTLIST+" value={String(shortlisted)} detail="Ứng viên tiềm năng" icon="✓"/><StatCard label="LỖI PIPELINE" value={String(failedRuns)} detail={failedRuns ? "Cần kiểm tra" : "Hệ thống ổn định"} icon="!"/></div><div className="grid layout-2-1" style={{ marginTop: 18 }}><div className="card"><div className="card-title"><h2>Tin tuyển dụng gần đây</h2><Link href="/employer/jobs">Quản lý tất cả →</Link></div>{jobs.map((job) => <Link className="dashboard-result" href={`/employer/jobs/${job.id}`} key={job.id}><div><b>{job.displayTitle ?? job.rawTitle}</b><small>{job.status} · hoàn thiện {Math.round(job.completeness * 100)}% · {job._count.applications} đơn</small></div><span className={`badge ${job.published ? "green" : "amber"}`}>{job.published ? "Đang tuyển" : "Bản nháp"}</span></Link>)}</div><div className="card"><div className="card-title"><h2>Ứng viên gần đây</h2><Link href="/employer/applications">Mở pipeline →</Link></div>{applications.map((item) => <Link className="document-row" href={`/employer/candidates/${item.candidateProfileId}`} key={item.id}><b>{item.candidateProfile.user.displayName}</b><small>{item.job.displayTitle ?? item.job.rawTitle} · {item.status}</small></Link>)}{!applications.length && <div className="empty">Chưa có đơn ứng tuyển.</div>}</div></div></AppShell>;
}
