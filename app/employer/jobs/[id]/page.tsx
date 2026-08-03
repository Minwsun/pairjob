import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmployerJobTabs } from "@/components/employer-job-tabs";
import { compensationRange } from "@/lib/compensation";
import { db } from "@/lib/db";
import { jobFromDb } from "@/lib/db-mappers";
import { getDemoEmployer } from "@/lib/demo-user";
import { recommendCandidates } from "@/lib/recommendation-engine";

export const dynamic = "force-dynamic";
const list = <T,>(value: unknown) => Array.isArray(value) ? value as T[] : [];

export default async function EmployerJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employer = await getDemoEmployer();
  const query = () => db.job.findFirst({
    where: { id, ownerId: employer.id },
    include: {
      _count: { select: { applications: true, matches: true } },
      matches: { orderBy: { score: "desc" as const }, take: 5, include: { candidateProfile: { include: { user: true } } } },
    },
  });
  let record = await query();
  if (!record) notFound();
  if (!record.matches.length) { await recommendCandidates(id); record = await query(); }
  if (!record) notFound();
  const job = jobFromDb(record);

  return <AppShell role="employer">
    <div className="page-head"><div><span className={`badge ${record.published ? "green" : "amber"}`}>{record.published ? "Đang tuyển" : "Bản nháp"}</span><h1>{record.displayTitle ?? record.rawTitle}</h1><p>{record.company} · {record.contractType} · {record.workMode}</p></div></div>
    <EmployerJobTabs jobId={id} active="overview"/>
    <div className="grid layout-2-1"><div>
      <section className="card"><h2>Mô tả tuyển dụng</h2><p className="long-copy">{record.canonicalSummary ?? record.rawDescription}</p></section>
      <section className="card" style={{ marginTop: 18 }}><div className="card-title"><h2>Ứng viên phù hợp nhất</h2><Link className="btn btn-light btn-sm" href={`/employer/jobs/${id}/matches`}>Xem Top 20</Link></div>
        {record.matches.length ? record.matches.map((match) => {
          const breakdown = match.breakdown as Record<string, unknown>;
          const fit = String(breakdown.fitStatus ?? (match.eligible ? "skill_gap" : "not_fit"));
          const badge = fit === "qualified" ? ["green", "Phù hợp"] : fit === "skill_gap" ? ["amber", "Phù hợp nhưng còn thiếu"] : ["red", "Không phù hợp"];
          const missing = list<string>(breakdown.missingRequirements);
          return <div className="job-manage-row" key={match.id}><div><h3><Link href={`/employer/candidates/${match.candidateProfileId}`}>{match.candidateProfile.user.displayName}</Link> <span className={`badge ${badge[0]}`}>{badge[1]}</span></h3><p>{match.candidateProfile.displayTitle ?? match.candidateProfile.occupation ?? "Chưa có chức danh"} · {match.candidateProfile.experienceYears} năm</p><small>{missing.length ? `Thiếu: ${missing.slice(0, 3).join(", ")}` : "Đáp ứng các yêu cầu chính"}</small></div><div className="candidate-score"><strong>{match.score}%</strong><small>Confidence {match.confidence}%</small></div></div>;
        }) : <div className="empty">Chưa có ứng viên để đối chiếu.</div>}
      </section>
      <section className="card" style={{ marginTop: 18 }}><h2>Kỹ năng bắt buộc</h2><div className="tags">{job.requiredSkills.map((skill) => <span className="tag required" key={skill.id}>{skill.label} · L{skill.level}</span>)}</div><h3 style={{ marginTop: 18 }}>Kỹ năng ưu tiên</h3><div className="tags">{job.preferredSkills.map((skill) => <span className="tag" key={skill.id}>{skill.label}</span>)}</div></section>
      <section className="card" style={{ marginTop: 18 }}><h2>Trách nhiệm và bàn giao</h2>{list<string>(record.responsibilities).map((item) => <div className="requirement-row" key={item}><b>{item}</b></div>)}{list<string>(record.deliverables).map((item) => <div className="requirement-row" key={item}><div><b>{item}</b><small>Deliverable</small></div></div>)}</section>
    </div><aside>
      <section className="card"><h3>Điều kiện</h3><p>Lương: <b>{compensationRange(job.compensation)}</b></p><p>Thời gian: <b>{record.weeklyHoursMin ? `${record.weeklyHoursMin}-${record.weeklyHoursMax} giờ/tuần` : record.projectDurationText ?? "Theo dự án"}</b></p><p>Deadline: <b>{record.deadlineText ?? "Không áp dụng"}</b></p><p>Kinh nghiệm: <b>{record.experienceMin}+ năm</b></p><p>Địa điểm: <b>{record.locationText ?? "Chưa cung cấp"}</b></p></section>
      <section className="card" style={{ marginTop: 18 }}><h3>Pipeline</h3><p>Đơn ứng tuyển: <b>{record._count.applications}</b></p><p>Ứng viên đã matching: <b>{record._count.matches}</b></p><p>Hoàn thiện tin: <b>{Math.round(record.completeness * 100)}%</b></p></section>
    </aside></div>
  </AppShell>;
}
