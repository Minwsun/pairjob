import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { compensationRange } from "@/lib/compensation";
import { candidateFromDb } from "@/lib/db-mappers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const list = <T,>(value: unknown) => Array.isArray(value) ? value as T[] : [];

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const profile = await db.candidateProfile.findUnique({ where: { id }, include: { user: true, applications: { include: { job: true }, orderBy: { updatedAt: "desc" } } } });
  if (!profile) notFound(); const candidate = candidateFromDb(profile); const documents = await db.document.findMany({ where: { ownerId: profile.userId }, orderBy: { createdAt: "desc" } });
  return <AppShell role="employer"><div className="page-head"><div><span className="badge green">Evidence {Math.round(candidate.evidenceQuality * 100)}%</span><h1>{candidate.name}</h1><p>{candidate.title} · {candidate.experienceYears} năm</p></div></div><div className="grid layout-2-1"><div><div className="card"><h2>Năng lực</h2><div className="tags">{candidate.skills.map((skill) => <span className="tag required" key={skill.id}>{skill.label} · L{skill.level} · {skill.evidence.length} evidence</span>)}</div></div><div className="card" style={{ marginTop: 18 }}><h2>Kinh nghiệm</h2>{list<Record<string, unknown>>(profile.experiences).map((item, index) => <div className="requirement-row" key={index}><div><b>{String(item.title ?? "Kinh nghiệm")}</b><small>{String(item.company ?? "")} · {String(item.description ?? "")}</small></div></div>)}</div><div className="card" style={{ marginTop: 18 }}><h2>Học vấn</h2>{list<Record<string, unknown>>(profile.education).map((item, index) => <div className="requirement-row" key={index}><b>{String(item.degree ?? item.field ?? "Chưa xác định")}</b></div>)}</div></div><aside><div className="card"><h3>Khả dụng</h3><p>Hình thức: <b>{candidate.workModes.join(", ")}</b></p><p>Thời gian: <b>{candidate.availability ?? "Chưa rõ"} giờ/tuần</b></p><p>Mức mong muốn: <b>{candidate.compensation ? compensationRange(candidate.compensation) : "Chưa cung cấp"}</b></p></div><div className="card" style={{ marginTop: 18 }}><h3>Tài liệu CV</h3>{documents.map((document) => <div className="document-row" key={document.id}><b>{document.filename ?? "URL CV"}</b><small>{document.status} · {document.mimeType}</small></div>)}</div></aside></div></AppShell>;
}
