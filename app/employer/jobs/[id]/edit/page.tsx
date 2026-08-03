import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmployerJobTabs } from "@/components/employer-job-tabs";
import { JobEditor } from "@/components/job-editor";
import { db } from "@/lib/db";
import { getDemoEmployer } from "@/lib/demo-user";
export const dynamic = "force-dynamic";
export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const employer = await getDemoEmployer(); const job = await db.job.findFirst({ where: { id, ownerId: employer.id } }); if (!job) notFound(); return <AppShell role="employer"><div className="page-head"><div><h1>Chỉnh sửa job</h1><p>{job.displayTitle ?? job.rawTitle}</p></div></div><EmployerJobTabs jobId={id} active="edit"/><JobEditor initial={job}/></AppShell>; }
