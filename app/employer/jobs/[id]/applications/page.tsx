import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApplicationStatusActions } from "@/components/application-status-actions";
import { EmployerJobTabs } from "@/components/employer-job-tabs";
import { db } from "@/lib/db";
import { getDemoEmployer } from "@/lib/demo-user";
export const dynamic = "force-dynamic";
export default async function JobApplicationsPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const employer = await getDemoEmployer(); const job = await db.job.findFirst({ where: { id, ownerId: employer.id }, include: { applications: { include: { candidateProfile: { include: { user: true } } }, orderBy: { updatedAt: "desc" } } } }); if (!job) notFound(); return <AppShell role="employer"><div className="page-head"><div><h1>Đơn ứng tuyển</h1><p>{job.displayTitle ?? job.rawTitle} · {job.applications.length} hồ sơ</p></div></div><EmployerJobTabs jobId={id} active="applications"/><div className="card">{job.applications.length ? job.applications.map((application) => <div className="application-card" key={application.id}><div><h3>{application.candidateProfile.user.displayName}</h3><p>{application.candidateProfile.displayTitle} · {application.status}</p></div><ApplicationStatusActions id={application.id} current={application.status}/></div>) : <div className="empty">Job này chưa có đơn ứng tuyển.</div>}</div></AppShell>; }
