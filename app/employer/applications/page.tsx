import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ApplicationStatusActions } from "@/components/application-status-actions";
import { db } from "@/lib/db";
import { getDemoEmployer } from "@/lib/demo-user";

export const dynamic = "force-dynamic";
export default async function EmployerApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const employer = await getDemoEmployer(); const { status } = await searchParams;
  const applications = await db.application.findMany({ where: { job: { ownerId: employer.id }, ...(status ? { status } : {}) }, include: { job: true, candidateProfile: { include: { user: true } } }, orderBy: { updatedAt: "desc" } });
  return <AppShell role="employer"><div className="page-head"><div><h1>Đơn ứng tuyển</h1><p>Quản lý pipeline tuyển dụng theo trạng thái thật.</p></div></div><form className="card filter-bar" style={{ marginBottom: 18 }}><select className="input" name="status" defaultValue={status ?? ""}><option value="">Mọi trạng thái</option><option value="APPLIED">APPLIED</option><option value="REVIEWING">REVIEWING</option><option value="SHORTLISTED">SHORTLISTED</option><option value="INTERVIEWED">INTERVIEWED</option><option value="REJECTED">REJECTED</option><option value="HIRED">HIRED</option></select><button className="btn btn-primary">Lọc</button></form><div className="card">{applications.length ? applications.map((application) => <div className="application-card" key={application.id}><div><h3><Link href={`/employer/candidates/${application.candidateProfileId}`}>{application.candidateProfile.user.displayName}</Link> · {application.candidateProfile.displayTitle}</h3><p><Link href={`/employer/jobs/${application.jobId}`}>{application.job.displayTitle ?? application.job.rawTitle}</Link> · {application.status}</p></div><ApplicationStatusActions id={application.id} current={application.status}/></div>) : <div className="empty">Chưa có đơn ứng tuyển trong nhóm này.</div>}</div></AppShell>;
}
