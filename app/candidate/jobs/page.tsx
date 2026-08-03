import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { RecommendationActions } from "@/components/recommendation-actions";
import { compensationRange } from "@/lib/compensation";
import { db } from "@/lib/db";
import { jobFromDb } from "@/lib/db-mappers";
import { getDemoCandidate } from "@/lib/demo-user";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 8;
const badges = { qualified: ["green", "Phù hợp"], skill_gap: ["amber", "Có thể tiếp cận"], not_fit: ["red", "Ít liên quan"] } as const;
const fitStatus = (score: number, eligible: boolean): keyof typeof badges => score >= 58 && eligible ? "qualified" : score >= 25 ? "skill_gap" : "not_fit";

export default async function CandidateJobsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { user, profile } = await getDemoCandidate();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const session = await db.recommendationSession.findFirst({
    where: { actorId: user.id, kind: "JOBS_FOR_CANDIDATE", queryEntityId: profile.id, status: "SUCCEEDED" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } }, items: { where: { jobId: { not: null } }, include: { job: true }, orderBy: { rankAfter: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE } },
  });
  const groups = [
    { id: "qualified", title: "Phù hợp nhất", color: "green" },
    { id: "skill_gap", title: "Cơ hội có thể tiếp cận", color: "amber" },
    { id: "not_fit", title: "Ít liên quan", color: "red" },
  ] as const;
  const sessionId = session?.id;
  const total = session?._count.items ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = session?.items.flatMap((item) => item.job ? [{ item, job: jobFromDb(item.job), status: fitStatus(item.matchScore, item.eligible), reasons: Array.isArray(item.reasons) ? item.reasons.map(String) : [] }] : []) ?? [];
  return <AppShell role="candidate"><div className="page-head"><div><h1>Việc dành cho bạn</h1><p>{total} việc đã được tính sẵn · trang {page}/{pages} · hồ sơ phiên bản {profile.profileVersion}.</p></div></div>{!session ? <div className="ai-note">Chưa có kết quả được tính sẵn. Cập nhật hồ sơ hoặc upload CV để hệ thống tạo recommendation nền.</div> : null}<div className="recommendation-groups">{groups.map((group) => { const grouped = items.filter((entry) => entry.status === group.id); return <section className="card" key={group.id}><div className="card-title"><h2>{group.title}</h2><span className={`badge ${group.color}`}>{grouped.length}</span></div>{grouped.length ? grouped.map(({ item, job, status }, index) => { const badge = badges[status]; return <article className="job-result-card" key={job.id}><div className="job-result-main"><div className="avatar">{job.company.slice(0, 2)}</div><div><h3><Link href={`/candidate/jobs/${job.id}`} prefetch={false}>{job.title}</Link> <span className={`badge ${badge[0]}`}>{badge[1]}</span></h3><p>{job.company} · {job.workMode} · {compensationRange(job.compensation)}</p><div className="tags">{job.requiredSkills.slice(0, 4).map((skill) => <span className="tag required" key={skill.id}>{skill.label}</span>)}</div><div className="quote">{Array.isArray(item.reasons) ? item.reasons.slice(0, 1).map(String).join(" · ") : "Kết quả đã được matching engine tính sẵn."}</div><div className="job-actions"><Link className="btn btn-primary btn-sm" href={`/candidate/jobs/${job.id}`} prefetch={false}>Xem chi tiết</Link>{sessionId ? <RecommendationActions role="candidate" sessionId={sessionId} targetJobId={job.id} position={(page - 1) * PAGE_SIZE + index + 1} /> : null}</div></div></div><div className="candidate-score"><strong>{Math.round(item.recommendationScore)}%</strong><small>Match {Math.round(item.matchScore)}% · Confidence {Math.round(item.confidence)}%</small></div></article>; }) : <div className="empty">Không có việc trong nhóm này trên trang này.</div>}</section>; })}</div>{session ? <div className="pagination" style={{ marginTop: 18, display: "flex", justifyContent: "space-between" }}><Link className={`btn btn-light ${page <= 1 ? "disabled" : ""}`} aria-disabled={page <= 1} href={`/candidate/jobs?page=${Math.max(1, page - 1)}`} prefetch={false}>← Trang trước</Link><span className="badge blue">{page}/{pages}</span><Link className={`btn btn-light ${page >= pages ? "disabled" : ""}`} aria-disabled={page >= pages} href={`/candidate/jobs?page=${Math.min(pages, page + 1)}`} prefetch={false}>Trang sau →</Link></div> : null}</AppShell>;
}
