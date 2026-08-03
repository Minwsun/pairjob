import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApplyButton } from "@/components/apply-button";
import { db } from "@/lib/db";
import { getDemoCandidate } from "@/lib/demo-user";
import { candidateFromDb, jobFromDb } from "@/lib/db-mappers";
import { loadTaxonomyGraph } from "@/lib/taxonomy/graph";
import { matchCandidate } from "@/lib/matching";
import { badgeForFitStatus, requirementBadge } from "@/lib/match-status";
import { compensationRange } from "@/lib/compensation";

export const dynamic = "force-dynamic";
const list = <T,>(value: unknown) => Array.isArray(value) ? value as T[] : [];
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const itemLabel = (item: Record<string, unknown>) => text(item.label ?? item.interpreted_name ?? item.raw_name ?? item.name ?? item.id) || "Chưa xác định";

function DetailList({ title, values }: { title: string; values: Record<string, unknown>[] }) {
  return <div className="card" style={{ marginTop: 18 }}><h3>{title}</h3>{values.length ? values.map((item, index) => <div className="requirement-row" key={`${title}-${index}`}><div><b>{itemLabel(item)}</b><small>{Object.entries(item).filter(([key, value]) => key !== "label" && key !== "interpreted_name" && key !== "raw_name" && key !== "name" && value !== null && typeof value !== "object").map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "Đã được nhà tuyển dụng xác nhận"}</small></div></div>) : <div className="empty">Chưa được nhà tuyển dụng cung cấp.</div>}</div>;
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ profile }, record, graph] = await Promise.all([
    getDemoCandidate(),
    db.job.findFirst({ where: { id, published: true }, include: { clarifications: { include: { answer: true }, orderBy: { position: "asc" } } } }),
    loadTaxonomyGraph(),
  ]);
  if (!record) notFound();
  const fullProfile = await db.candidateProfile.findUniqueOrThrow({ where: { id: profile.id }, include: { user: true } });
  const job = jobFromDb(record);
  const result = matchCandidate(job, candidateFromDb(fullProfile), graph);
  const application = await db.application.findUnique({ where: { jobId_candidateProfileId: { jobId: id, candidateProfileId: profile.id } } });
  const badge = badgeForFitStatus(result.fitStatus);
  const extraction = record.extraction && typeof record.extraction === "object" && !Array.isArray(record.extraction) ? record.extraction as Record<string, unknown> : {};
  const summary = record.canonicalSummary || text(extraction.corrected_interpretation) || record.rawDescription;
  const canonicalRequirements = list<{ section: string; statement: string }>(record.canonicalRequirements);
  const preferred = list<{ id: string; label: string }>(record.preferredSkills);
  const domains = list<string>(record.domains);
  const answers = record.clarifications.filter((question) => question.answer && question.status === "ANSWERED");
  return <AppShell role="candidate" active="Việc phù hợp">
    <div className="page-head"><div><span className={`badge ${badge.color}`}>{badge.label} · {result.score}%</span><h1>{record.displayTitle ?? record.rawTitle}</h1><p>{record.company ?? "Chưa cập nhật"} · {record.workMode ?? "Chưa rõ"} · {record.contractType ?? "Chưa rõ hợp đồng"} · {record.locationText ?? "Chưa rõ địa điểm"}</p></div><ApplyButton jobId={id} applied={Boolean(application)} /></div>
    <div className="grid layout-2-1"><div>
      <div className="card"><h2>Thông tin tuyển dụng</h2><p className="long-copy">{summary}</p>{canonicalRequirements.length ? <div className="clarification-list">{canonicalRequirements.map((item, index) => <div className="requirement-row" key={`${item.section}-${index}`}><div><b>{item.statement}</b><small>{item.section.replaceAll("_", " ")}</small></div></div>)}</div> : null}</div>
      <div className="card" style={{ marginTop: 18 }}><h2>Yêu cầu kỹ năng bắt buộc</h2>{job.requiredSkills.length ? job.requiredSkills.map((skill) => { const assessment = result.requiredSkillAssessments?.find((item) => item.requirementId === skill.id); const state = assessment ? badgeForFitStatus(assessment.status) : requirementBadge(0); return <div className="requirement-row" key={skill.id}><div><b>{skill.label}</b><small>Level yêu cầu {skill.level}{assessment?.candidateSkill ? ` · ${assessment.candidateSkill} · ${assessment.relation} · ${assessment.path.join(" › ")}` : " · chưa có evidence phù hợp"}</small></div><span className={`badge ${state.color}`}>{assessment ? `${state.label} ${Math.round(assessment.contribution * 100)}%` : state.label}</span></div>; }) : <div className="empty">Nhà tuyển dụng chưa xác nhận kỹ năng bắt buộc.</div>}</div>
      <div className="card" style={{ marginTop: 18 }}><h3>Kỹ năng ưu tiên</h3><div className="tags">{preferred.length ? preferred.map((skill) => <span className="tag" key={skill.id}>{skill.label}</span>) : <span>Chưa được nhà tuyển dụng cung cấp.</span>}</div></div>
      <DetailList title="Ngôn ngữ" values={list(record.languageRequirements)} />
      <DetailList title="Chứng chỉ" values={list(record.certificationRequirements)} />
      <DetailList title="Học vấn" values={list(record.educationRequirements)} />
      {answers.length ? <details className="card" style={{ marginTop: 18 }}><summary><b>Lịch sử làm rõ</b></summary><p>Dữ liệu gốc được giữ để đối chiếu; nội dung phía trên là bản AI đã viết lại.</p></details> : null}
      <details className="card" style={{ marginTop: 18 }}><summary><b>Yêu cầu nguyên văn</b></summary><p className="long-copy">{record.rawDescription}</p></details>
    </div><aside>
      <div className="card"><div className="candidate-score detail-score"><strong>{result.score}%</strong><small>Confidence {result.confidence}%</small></div><p>Tương đồng nghề nghiệp: <b>{Math.round((result.occupationSimilarity ?? result.treeCompatibility) * 100)}%</b></p><p>Phương pháp: <b>{result.occupationSimilarityMethod ?? "graph"}</b></p>{result.occupationSharedConcepts?.length ? <p>Khái niệm chung: <b>{result.occupationSharedConcepts.join(", ")}</b></p> : null}<p>Độ phủ bắt buộc: <b>{Math.round(result.requiredCoverage * 100)}%</b></p><p>Evidence coverage: <b>{Math.round((result.evidenceCoverage ?? 0) * 100)}%</b></p><div className="quote">{result.reasons.join(" · ")}</div></div>
      <div className="card" style={{ marginTop: 18 }}><h3>Điều kiện công việc</h3><p>Kinh nghiệm: <b>{record.experienceMin ? `${record.experienceMin}+ năm` : "Không bắt buộc"}</b></p><p>Ngân sách: <b>{compensationRange(job.compensation)}</b></p><p>Thời hạn: <b>{record.deadlineText ?? "Chưa cung cấp"}</b></p><p>Thời gian: <b>{record.weeklyHoursMin ? `${record.weeklyHoursMin}-${record.weeklyHoursMax ?? record.weeklyHoursMin} giờ/tuần` : record.compensationPeriod === "PROJECT" ? record.projectDurationText ?? "Theo deadline dự án" : "Chưa cung cấp"}</b></p><p>Lĩnh vực: <b>{domains.length ? domains.join(", ") : "Chưa cung cấp"}</b></p></div>
      <div className="card" style={{ marginTop: 18 }}><h3>Khoảng trống cần cải thiện</h3>{result.skillGaps?.length ? result.skillGaps.map((skill) => <span className="tag required" key={skill}>{skill}</span>) : <p>Không có khoảng trống bắt buộc.</p>}{result.softConstraintViolations?.map((blocker) => <div className="ai-note" style={{ borderColor: "var(--amber)", marginTop: 10 }} key={blocker}><b>Có thể thương lượng:</b> {blocker}</div>)}{result.hardConstraintViolations?.map((blocker) => <div className="ai-note" style={{ borderColor: "var(--red)", marginTop: 10 }} key={blocker}><b>Điều kiện bắt buộc:</b> {blocker}</div>)}</div>
    </aside></div>
  </AppShell>;
}
