import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";
export const dynamic="force-dynamic";
export default async function CandidateApplicationsPage(){const{profile}=await getDemoCandidate();const applications=await db.application.findMany({where:{candidateProfileId:profile.id},include:{job:true,events:{orderBy:{createdAt:"desc"}}},orderBy:{updatedAt:"desc"}});return <AppShell role="candidate" active="Đơn ứng tuyển"><div className="page-head"><div><h1>Đơn ứng tuyển</h1><p>Theo dõi toàn bộ tiến trình tuyển dụng.</p></div></div><div className="card">{applications.length?applications.map(application=><div className="application-row" key={application.id}><div><Link href={`/candidate/jobs/${application.jobId}`}><h3>{application.job.displayTitle??application.job.rawTitle}</h3></Link><p>{application.job.company} · ứng tuyển {application.createdAt.toLocaleDateString("vi-VN")}</p></div><span className="badge blue">{application.status}</span></div>):<div className="empty">Bạn chưa ứng tuyển công việc nào.</div>}</div></AppShell>}
