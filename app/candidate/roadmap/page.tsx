import { AppShell } from "@/components/app-shell";
import { getDemoCandidate } from "@/lib/demo-user";
import { db } from "@/lib/db";
import { buildCareerRoadmap } from "@/lib/career-roadmap";
import { enqueueRecompute } from "@/lib/recompute";

export const dynamic = "force-dynamic";

type Strength = { skill_id?: string; skillId?: string; skill: string; assessment?: string };
type Gap = { skill_id?: string; skillId?: string; skill: string; gap_type?: string; type?: string; why?: string; related_skill?: string | null; relatedSkill?: string | null };
type Guidance = { title: string; explanation: string; next_action?: string };
type Position = { title: string; level: string; reasons: string[] };
type FutureDirection = { title: string; why_fit: string; capabilities_to_build: string[]; possible_position: string };
type Phase = { order: number; title: string; goal: string; reason?: string; skills: string[]; actions: string[]; deliverable: string; completion_criteria?: string[]; completionCriteria?: string[]; readiness_signs?: string[] };
type Roadmap = { presentation_version?: number; target: string; current_level?: string; currentLevel?: string; summary?: string; evaluated_jobs?: number; evaluatedJobs?: number; current_position?: Position; doing_well?: Guidance[]; needs_improvement?: Guidance[]; growth_opportunities?: Guidance[]; future_directions?: FutureDirection[]; strengths?: Strength[]; gaps?: Gap[]; phases?: Phase[]; market_context?: string };

const readableLevel = (level?: string) => level === "senior" ? "Chuyên viên giàu kinh nghiệm" : level === "middle" ? "Chuyên viên" : level === "junior" ? "Nhân sự mới có kinh nghiệm" : level === "entry" ? "Vị trí bắt đầu" : level || "Đang xác định";
const cleanText = (text: string) => text.replace(/;?\s*khoảng trống loại [a-z_]+\.?/gi, ".").replace(/ở mức \d+(?:\.\d+)?/gi, "trong tình huống thực tế").replace(/evidence/gi, "ví dụ thực tế").replace(/\s+/g, " ").trim();

export default async function RoadmapPage() {
  const { profile } = await getDemoCandidate();
  const target = profile.occupation;
  const occupation = target ? await db.taxonomyLabel.findUnique({ where: { id: target }, include: { parent: true, children: { where: { status: "ACTIVE" }, take: 8 }, outgoingEdges: { where: { status: "ACTIVE" }, include: { to: true }, take: 30 }, incomingEdges: { where: { status: "ACTIVE" }, include: { from: true }, take: 30 } } }) : null;
  const stored = target ? await db.roadmapVersion.findFirst({ where: { candidateProfileId: profile.id, profileVersion: profile.profileVersion, targetOccupationId: target }, orderBy: { createdAt: "desc" } }) : null;
  let roadmap = stored?.roadmap as Roadmap | null;
  const incomplete = roadmap && (roadmap.presentation_version !== 2 || !roadmap.current_position || !roadmap.doing_well || !roadmap.needs_improvement || !roadmap.growth_opportunities || !roadmap.future_directions);
  if (incomplete) {
    roadmap = await buildCareerRoadmap(profile.id) as Roadmap;
    await enqueueRecompute(profile.id, profile.profileVersion, true);
  }
  if (!target) return <AppShell role="candidate"><div className="page-head"><div><h1>Lộ trình phát triển</h1><p>CV chưa cho thấy rõ nghề nghiệp chính.</p></div></div><div className="ai-note">Hãy bổ sung chức danh, công việc từng làm hoặc dự án tiêu biểu để hệ thống định hướng chính xác hơn.</div></AppShell>;
  if (!roadmap) return <AppShell role="candidate"><div className="page-head"><div><h1>Lộ trình phát triển</h1><p>Đang xây dựng định hướng cho {occupation?.preferredName ?? target}.</p></div></div><div className="card"><div className="loading-spinner" /><p>Hệ thống đang đọc hồ sơ và tổng hợp hướng phát triển phù hợp.</p></div></AppShell>;

  const strengths = roadmap.strengths ?? [];
  const gaps = roadmap.gaps ?? [];
  const position = roadmap.current_position ?? {
    title: occupation?.preferredName ?? roadmap.target,
    level: readableLevel(roadmap.current_level ?? roadmap.currentLevel),
    reasons: strengths.slice(0, 3).map((item) => `Bạn đã có nền tảng ${item.skill} phù hợp với công việc này.`),
  };
  const doingWell = roadmap.doing_well?.length ? roadmap.doing_well : strengths.map((item) => ({ title: item.skill, explanation: item.assessment && !item.assessment.toLowerCase().includes("evidence") ? item.assessment : `Đây là một năng lực đang hỗ trợ trực tiếp cho hướng nghề nghiệp hiện tại của bạn.` }));
  const needsImprovement = roadmap.needs_improvement?.length ? roadmap.needs_improvement : gaps.filter((item) => !["transferable_skill"].includes(item.gap_type ?? item.type ?? "")).map((item) => ({ title: item.skill, explanation: item.why ?? `Năng lực này xuất hiện thường xuyên trong các công việc cùng nghề.`, next_action: `Bổ sung kiến thức và áp dụng ${item.skill} trong một công việc hoặc dự án thực tế.` }));
  const growthOpportunities = roadmap.growth_opportunities?.length ? roadmap.growth_opportunities : gaps.filter((item) => (item.gap_type ?? item.type) === "transferable_skill").map((item) => ({ title: item.skill, explanation: `${item.related_skill ?? item.relatedSkill ?? "Nền tảng hiện có"} giúp bạn tiếp cận kỹ năng này nhanh hơn.`, next_action: `Phát triển thêm ${item.skill} trên nền kỹ năng bạn đã có.` }));
  const relatedConcepts = occupation ? [...occupation.children, ...occupation.outgoingEdges.map((edge) => edge.to), ...occupation.incomingEdges.map((edge) => edge.from)].filter((item, index, items) => item.id !== occupation.id && item.id !== occupation.parentId && ["occupation", "specialization"].includes(item.type) && items.findIndex((candidate) => candidate.id === item.id) === index) : [];
  const graphDirections = relatedConcepts.slice(0, 3).map((item) => ({ title: `Mở rộng sang ${item.preferredName}`, why_fit: `${item.preferredName} là một hướng nghề gần với ${occupation?.preferredName ?? roadmap.target}.`, capabilities_to_build: gaps.slice(0, 3).map((gap) => gap.skill), possible_position: item.preferredName }));
  const skillDirections = gaps.slice(0, Math.max(0, 3 - graphDirections.length)).map((gap) => ({ title: `Chuyên sâu về ${gap.skill}`, why_fit: `${gap.skill} xuất hiện trong yêu cầu của các công việc cùng nghề nhưng CV hiện chưa thể hiện đầy đủ năng lực này.`, capabilities_to_build: [gap.skill], possible_position: `${occupation?.preferredName ?? roadmap.target} chuyên sâu ${gap.skill}` }));
  const futureDirections = roadmap.future_directions?.length ? roadmap.future_directions : [...graphDirections, ...skillDirections];
  const phases = roadmap.phases ?? [];

  return <AppShell role="candidate">
    <div className="page-head"><div><div className="eyebrow">Định hướng từ CV của bạn</div><h1>Lộ trình phát triển</h1><p>Tập trung vào đúng nghề nghiệp hiện tại, khả năng đang có và yêu cầu thực tế của công việc.</p></div></div>
    {roadmap.summary && <div className="ai-note" style={{ marginBottom: 18 }}><b>Nhận định chung:</b> {roadmap.summary}</div>}

    <section className="card"><div className="eyebrow">Vị trí phù hợp hiện tại</div><h2 style={{ fontSize: 30, marginBottom: 6 }}>{position.title}</h2><p style={{ color: "var(--muted)", fontSize: 16 }}>{readableLevel(position.level)}</p><h3>Vì sao phù hợp?</h3>{position.reasons.length ? position.reasons.map((reason) => <div className="requirement-row" key={reason}><div><b>{reason}</b></div></div>) : <p>Hồ sơ cho thấy nền tảng phù hợp với hướng nghề này, nhưng cần mô tả thêm công việc và dự án để nhận định cụ thể hơn.</p>}</section>

    <div className="grid layout-2-1" style={{ marginTop: 18 }}><section className="card"><div className="card-title"><h2>Bạn đang làm tốt</h2><span>{doingWell.length} năng lực</span></div>{doingWell.length ? doingWell.map((item) => <article className="requirement-row" key={item.title}><div><b>{item.title}</b><small>{item.explanation}</small></div></article>) : <div className="empty">CV chưa mô tả đủ rõ các năng lực nổi bật.</div>}</section><aside className="card"><h2>Hướng phát triển</h2><p>{roadmap.market_context || `Tiếp tục nâng năng lực trong nhóm nghề ${occupation?.parent?.preferredName ?? occupation?.preferredName ?? roadmap.target}.`}</p><p style={{ color: "var(--muted)" }}>Định hướng được tổng hợp từ CV, các kỹ năng liên quan và yêu cầu của công việc cùng nghề.</p></aside></div>

    <div className="grid layout-2-1" style={{ marginTop: 18 }}><section className="card"><div className="card-title"><h2>Cần bổ sung</h2><span>{needsImprovement.length} nội dung</span></div>{needsImprovement.length ? needsImprovement.map((item) => <article className="requirement-row" key={item.title}><div><b>{item.title}</b><small>{item.explanation}</small>{item.next_action && <p>{item.next_action}</p>}</div></article>) : <div className="empty">Chưa có thiếu hụt quan trọng cần ưu tiên ngay.</div>}</section><section className="card"><div className="card-title"><h2>Có thể phát triển thêm</h2><span>{growthOpportunities.length} hướng</span></div>{growthOpportunities.length ? growthOpportunities.map((item) => <article className="requirement-row" key={item.title}><div><b>{item.title}</b><small>{item.explanation}</small>{item.next_action && <p>{item.next_action}</p>}</div></article>) : <div className="empty">Hãy hoàn thành các ưu tiên chính trước khi mở rộng sang kỹ năng mới.</div>}</section></div>

    <section className="card" style={{ marginTop: 18 }}><div className="card-title"><h2>Hướng đi xa hơn trong nghề</h2><span>{futureDirections.length} hướng</span></div>{futureDirections.length ? <div className="recommendation-groups">{futureDirections.map((direction) => <article className="job-result-card" key={direction.title}><div className="job-result-main"><div><h3>{direction.title}</h3><p><b>Vì sao phù hợp:</b> {direction.why_fit}</p><p><b>Năng lực cần phát triển:</b> {direction.capabilities_to_build.join(", ")}</p><p><b>Vị trí có thể hướng tới:</b> {direction.possible_position}</p></div></div></article>)}</div> : <div className="empty">Chưa có đủ dữ liệu nghề liên quan để đề xuất hướng mở rộng đáng tin cậy.</div>}</section>

    <section className="card" style={{ marginTop: 18 }}><div className="card-title"><h2>Các bước phát triển đề xuất</h2><span>{phases.length} giai đoạn</span></div>{phases.length ? phases.sort((left, right) => left.order - right.order).map((phase) => { const readiness = phase.readiness_signs?.length ? phase.readiness_signs : phase.completion_criteria ?? phase.completionCriteria ?? []; return <article className="roadmap-item" data-n={phase.order} key={`${phase.order}-${phase.title}`}><h3>{phase.title}</h3><p><b>Mục tiêu:</b> {cleanText(phase.goal)}</p><div className="quote"><b>Vì sao cần:</b> {cleanText(phase.reason || `${phase.skills.join(", ")} giúp bạn đáp ứng tốt hơn yêu cầu của nghề hiện tại.`)}</div><h4>Việc cần làm:</h4>{phase.actions.map((action) => <div className="requirement-row" key={action}><div><b>{cleanText(action)}</b></div></div>)}<div className="quote"><b>Kết quả cần đạt:</b> {cleanText(phase.deliverable)}</div><h4>Khi nào hoàn thành:</h4><div className="tags">{readiness.map((item) => <span className="tag" key={item}>{cleanText(item)}</span>)}</div></article>; }) : <div className="empty">Hệ thống đang hoàn thiện các bước phát triển cụ thể.</div>}</section>
  </AppShell>;
}
