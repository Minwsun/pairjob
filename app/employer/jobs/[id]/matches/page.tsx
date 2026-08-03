import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmployerJobTabs } from "@/components/employer-job-tabs";
import { RecommendationActions } from "@/components/recommendation-actions";
import { compensationRange } from "@/lib/compensation";
import { db } from "@/lib/db";
import { jobFromDb } from "@/lib/db-mappers";
import { getDemoEmployer } from "@/lib/demo-user";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 10;
const fitBadge = { qualified: ["green", "Phù hợp"], skill_gap: ["amber", "Có thể tiếp cận"], not_fit: ["red", "Ít liên quan"] } as const;

export default async function MatchesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const employer = await getDemoEmployer();
  const [record, session] = await Promise.all([
    db.job.findFirst({ where: { id, ownerId: employer.id } }),
    db.recommendationSession.findFirst({ where: { actorId: employer.id, kind: "CANDIDATES_FOR_JOB", queryEntityId: id, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, include: { _count: { select: { items: true } }, items: { where: { candidateProfileId: { not: null } }, include: { candidateProfile: { include: { user: true } } }, orderBy: { rankAfter: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE } } }),
  ]);
  if (!record) notFound();
  const job = jobFromDb(record);
  const candidateIds = session?.items.flatMap((item) => item.candidateProfileId ? [item.candidateProfileId] : []) ?? [];
  const matches = candidateIds.length ? await db.matchResult.findMany({ where: { jobId: id, candidateProfileId: { in: candidateIds } } }) : [];
  const matchByCandidate = new Map(matches.map((match) => [match.candidateProfileId, match]));
  const total = session?._count.items ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = session?.items.flatMap((item) => item.candidateProfile && item.candidateProfileId ? [{ item, profile: item.candidateProfile, match: matchByCandidate.get(item.candidateProfileId) }] : []) ?? [];
  return <AppShell role="employer"><div className="page-head"><div><span className={`badge ${record.published ? "green" : "amber"}`}>{record.published ? "Đang tuyển" : "Bản nháp"}</span><h1>{record.displayTitle ?? record.rawTitle}</h1><p>{total} ứng viên đã được xếp hạng · trang {page}/{pages} · {compensationRange(job.compensation)}</p></div></div><EmployerJobTabs jobId={id} active="matches"/>{!session ? <div className="ai-note">Chưa có kết quả tính sẵn. Xác nhận hoặc cập nhật tin tuyển dụng để chạy matching nền.</div> : null}<div className="grid layout-2-1"><div className="card"><div className="card-title"><h2>Xếp hạng ứng viên</h2><span className="badge blue">Top 20</span></div>{items.map(({ item, profile, match }, index) => { const breakdown = match?.breakdown && typeof match.breakdown === "object" && !Array.isArray(match.breakdown) ? match.breakdown as Record<string, unknown> : {}; const status = String(breakdown.fitStatus ?? (item.matchScore >= 58 && item.eligible ? "qualified" : item.matchScore >= 25 ? "skill_gap" : "not_fit")) as keyof typeof fitBadge; const badge = fitBadge[status] ?? fitBadge.skill_gap; const skills = Array.isArray(profile.skills) ? profile.skills as { id: string; label: string }[] : []; return <div className="candidate-card" key={profile.id}><div className="avatar">{profile.user.displayName.slice(0, 2)}</div><div><h3>#{(page - 1) * PAGE_SIZE + index + 1} · <Link href={`/employer/candidates/${profile.id}`} prefetch={false}>{profile.user.displayName}</Link> <span className={`badge ${badge[0]}`}>{badge[1]}</span></h3><p>{profile.displayTitle} · {profile.experienceYears} năm</p><div className="tags">{skills.slice(0, 5).map((skill) => <span className="tag" key={skill.id}>{skill.label}</span>)}</div><small>Độ phủ ngữ nghĩa {Math.round(Number(breakdown.semanticCoverage ?? breakdown.requiredCoverage ?? 0) * 100)}% · tương thích nghề {Math.round(Number(breakdown.treeCompatibility ?? 0) * 100)}%</small><div className="quote">{Array.isArray(match?.reasons) ? match.reasons.slice(0, 1).map(String).join(" · ") : "Kết quả đã được matching engine tính sẵn."}</div><RecommendationActions role="employer" sessionId={session!.id} targetJobId={id} targetCandidateId={profile.id} position={(page - 1) * PAGE_SIZE + index + 1}/></div><div className="candidate-score"><strong>{Math.round(item.recommendationScore)}%</strong><small>Match {Math.round(item.matchScore)}% · Confidence {Math.round(item.confidence)}%</small></div></div>; })}{!items.length ? <div className="empty">Chưa có ứng viên được tính sẵn.</div> : null}{session ? <div className="pagination" style={{ marginTop: 18, display: "flex", justifyContent: "space-between" }}><Link className={`btn btn-light ${page <= 1 ? "disabled" : ""}`} aria-disabled={page <= 1} href={`/employer/jobs/${id}/matches?page=${Math.max(1, page - 1)}`} prefetch={false}>← Trang trước</Link><span className="badge blue">{page}/{pages}</span><Link className={`btn btn-light ${page >= pages ? "disabled" : ""}`} aria-disabled={page >= pages} href={`/employer/jobs/${id}/matches?page=${Math.min(pages, page + 1)}`} prefetch={false}>Trang sau →</Link></div> : null}</div><aside className="card"><h3>Yêu cầu chuẩn hóa</h3><div className="tags">{job.requiredSkills.map((skill) => <span className="tag required" key={skill.id}>{skill.label}</span>)}</div><Link className="btn btn-light" style={{ marginTop: 18 }} href={`/employer/jobs/${id}/edit`} prefetch={false}>Chỉnh sửa yêu cầu</Link></aside></div></AppShell>;
}
