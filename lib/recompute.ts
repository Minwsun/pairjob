import { db } from "@/lib/db";
import { recommendJobs } from "@/lib/recommendation-engine";
import { buildCareerRoadmap } from "@/lib/career-roadmap";
import { generateStructured } from "@/lib/ai/client";
import { careerRoadmapSchema } from "@/lib/ai/schemas";
import { systemPrompts } from "@/lib/prompts";
import { activeRankingPolicy } from "@/lib/ranking-policy";
import { after } from "next/server";
import { z } from "zod";
import { refreshCandidateEmbedding } from "@/lib/embeddings/store";

export async function processRecomputeTask(taskId: string) {
  const task = await db.recomputeTask.findUniqueOrThrow({ where: { id: taskId }, include: { candidateProfile: true } });
  if (task.status === "SUCCEEDED") return task;
  const now = new Date();
  const claimed = await db.recomputeTask.updateMany({ where: { id: task.id, OR: [{ status: "PENDING", nextAttemptAt: null }, { status: "PENDING", nextAttemptAt: { lte: now } }, { status: "RUNNING", leaseUntil: { lt: now } }] }, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: now, lockedAt: now, leaseUntil: new Date(now.getTime() + 4 * 60_000), error: null, progress: 5 } });
  if (!claimed.count) return db.recomputeTask.findUniqueOrThrow({ where: { id: task.id } });
  try {
    const current = await db.candidateProfile.findUniqueOrThrow({ where: { id: task.candidateProfileId } });
    if (current.profileVersion !== task.profileVersion) return db.recomputeTask.update({ where: { id: task.id }, data: { status: "SUPERSEDED", completedAt: new Date() } });
    await db.recomputeTask.update({ where: { id: task.id }, data: { progress: 15, totalItems: 3 } });
    await refreshCandidateEmbedding(current.id);
    await db.recomputeTask.update({ where: { id: task.id }, data: { progress: 25, processedItems: 1 } });
    await recommendJobs(current.id);
    await db.recomputeTask.update({ where: { id: task.id }, data: { progress: 65, processedItems: 2 } });
    const deterministic = await buildCareerRoadmap(current.id);
    let roadmap: unknown = deterministic;
    try {
      const [document, occupationLabel] = await Promise.all([
        db.document.findFirst({ where: { ownerId: current.userId, status: "PARSED" }, orderBy: { createdAt: "desc" }, select: { rawText: true, sections: true } }),
        current.occupation ? db.taxonomyLabel.findUnique({ where: { id: current.occupation }, include: { parent: true, outgoingEdges: { where: { status: "ACTIVE" }, include: { to: true }, take: 30 }, incomingEdges: { where: { status: "ACTIVE" }, include: { from: true }, take: 30 } } }) : null,
      ]);
      const cvContext = { displayTitle: current.displayTitle, occupation: current.occupation, experienceYears: current.experienceYears, skills: current.skills, domains: current.domains, experiences: current.experiences, projects: current.projects, education: current.education, evidenceQuality: current.evidenceQuality, completeness: current.completeness, parsedSummary: document?.rawText?.slice(0, 8000) ?? null, sections: document?.sections };
      const firstHop = occupationLabel ? [...occupationLabel.outgoingEdges.map((edge) => ({ id: edge.to.id, type: edge.to.type, relation: edge.relation, concept: edge.to.preferredName })), ...occupationLabel.incomingEdges.map((edge) => ({ id: edge.from.id, type: edge.from.type, relation: edge.relation, concept: edge.from.preferredName }))] : [];
      const firstHopIds = [...new Set(firstHop.map((item) => item.id))];
      const secondHopEdges = firstHopIds.length ? await db.taxonomyEdge.findMany({ where: { status: "ACTIVE", OR: [{ fromId: { in: firstHopIds } }, { toId: { in: firstHopIds } }] }, include: { from: true, to: true }, take: 100 }) : [];
      const relatedOccupationIds = [current.occupation, ...firstHop.filter((item) => ["occupation", "specialization"].includes(item.type)).map((item) => item.id)].filter((id): id is string => Boolean(id));
      const marketJobs = relatedOccupationIds.length ? await db.job.findMany({ where: { published: true, occupation: { in: relatedOccupationIds } }, select: { displayTitle: true, occupation: true, requiredSkills: true, preferredSkills: true, responsibilities: true }, take: 40 }) : [];
      const occupationContext = occupationLabel ? { id: occupationLabel.id, name: occupationLabel.preferredName, parent: occupationLabel.parent?.preferredName ?? null, first_hop: firstHop, second_hop: secondHopEdges.map((edge) => ({ from: edge.from.preferredName, relation: edge.relation, to: edge.to.preferredName })), related_job_requirements: marketJobs } : null;
      const generated = await generateStructured(`Bạn là chuyên gia hướng nghiệp nói chuyện trực tiếp với ứng viên. Lấy nghề chính trong deterministic_roadmap làm trục; không đổi nghề tùy tiện. Ngoài nội dung CV, phải khai thác occupation_tree_context và yêu cầu tuyển dụng liên quan để đề xuất kỹ năng tương lai, công cụ, kỹ năng mềm, vị trí cấp cao hơn và nhánh nghề gần. Mỗi hướng mở rộng phải giải thích rõ liên hệ với nghề hiện tại; không đề xuất ngành xa. Trả lời rõ ứng viên hiện phù hợp vị trí nào, vì sao, đang làm tốt gì, còn thiếu gì, có thể mở rộng theo hướng nào và nên phát triển thế nào. Dùng tiếng Việt tự nhiên, câu ngắn, chủ ngữ rõ; không dùng evidence, confidence, taxonomy, gap_type, level kỹ thuật hoặc ngôn ngữ chấm điểm. Không nhắc nhãn đỏ/vàng/xanh. Nếu CV mô tả chưa rõ, chuyển thành hành động cụ thể. Tự chia 3-5 giai đoạn, không gắn ngày. Mỗi giai đoạn phải có nội dung tương ứng chính xác với các nhãn: Mục tiêu, Vì sao cần, Việc cần làm, Kết quả cần đạt, Khi nào hoàn thành. Không bịa khóa học, chứng chỉ, URL, mức lương hoặc nhu cầu thị trường không có trong input. Trả duy nhất JSON đúng output_schema.\noutput_schema=${JSON.stringify(z.toJSONSchema(careerRoadmapSchema))}`, { deterministic_roadmap: { occupation_id: deterministic.occupation, current_level: deterministic.currentLevel, current_score: deterministic.currentScore, projected_score: deterministic.projectedScore, evaluated_jobs: deterministic.evaluatedJobs, strengths: deterministic.strengths, gaps: deterministic.gaps, steps: deterministic.steps }, cv_context: cvContext, occupation_tree_context: occupationContext }, careerRoadmapSchema, "reasoning", { attempts: 1, timeoutMs: 60_000 });
      const deterministicGapById = new Map(deterministic.gaps.map((gap) => [gap.skillId, gap]));
      roadmap = { ...generated, target: generated.target || occupationLabel?.preferredName || deterministic.target, occupation_id: deterministic.occupation, current_level: deterministic.currentLevel, target_level: generated.target_level || `Nâng cao trong ${occupationLabel?.preferredName ?? deterministic.target}`, current_score: deterministic.currentScore, projected_score: deterministic.projectedScore, evaluated_jobs: deterministic.evaluatedJobs, strengths: generated.strengths.length ? generated.strengths.map((strength) => { const source = deterministic.strengths.find((item) => item.skillId === strength.skill_id || item.skill.toLowerCase() === strength.skill.toLowerCase()); return source ? { ...strength, skill_id: source.skillId, level: source.level, evidence: source.evidence, confidence: source.confidence } : strength; }) : deterministic.strengths.map((item) => ({ skill_id: item.skillId, skill: item.skill, level: item.level, assessment: `${item.evidenceCount} evidence trong CV`, evidence: item.evidence, confidence: item.confidence })), gaps: generated.gaps.length ? generated.gaps.map((gap) => { const source = deterministicGapById.get(gap.skill_id) ?? deterministic.gaps.find((item) => item.skill.toLowerCase() === gap.skill.toLowerCase()); return source ? { ...gap, skill_id: source.skillId, gap_type: source.type, related_skill: source.relatedSkill, frequency: source.jobFrequency, estimated_impact: source.estimatedImpact, taxonomy_path: source.taxonomyPath } : gap; }) : deterministic.gaps.map((gap) => ({ skill_id: gap.skillId, skill: gap.skill, gap_type: gap.type, why: `${gap.jobCount}/${deterministic.evaluatedJobs} việc đúng nghề yêu cầu kỹ năng này.`, related_skill: gap.relatedSkill, frequency: gap.jobFrequency, estimated_impact: gap.estimatedImpact, taxonomy_path: gap.taxonomyPath })), steps: generated.steps.length ? generated.steps : deterministic.steps.map((step) => ({ priority: step.priority, skill: step.skill, reason: step.reason, practice_action: step.practiceAction, evidence_to_add: step.evidenceToAdd, estimated_impact: step.estimatedImpact, taxonomy_path: step.taxonomyPath })), phases: generated.phases.length ? generated.phases : deterministic.phases.map((phase) => ({ order: phase.order, title: phase.title, goal: phase.goal, reason: phase.goal, skills: phase.skills, actions: phase.actions, deliverable: phase.deliverable, evidence_to_add: phase.evidence, completion_criteria: phase.completionCriteria, readiness_signs: phase.completionCriteria, expected_impact: phase.expectedImpact })) };
    } catch {}
    const policy = await activeRankingPolicy("JOBS_FOR_CANDIDATE");
    const taxonomy = await db.taxonomyLabel.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
    await db.roadmapVersion.create({ data: { candidateProfileId: current.id, profileVersion: current.profileVersion, targetOccupationId: deterministic.target, taxonomyVersion: taxonomy?.updatedAt.toISOString() ?? "empty", rankingPolicyVersion: policy.version, roadmap: roadmap as object } });
    await db.candidateProfile.update({ where: { id: current.id }, data: { lastRecomputedVersion: current.profileVersion } });
    return db.recomputeTask.update({ where: { id: task.id }, data: { status: "SUCCEEDED", progress: 100, processedItems: 3, completedAt: new Date(), leaseUntil: null } });
  } catch (error) {
    const failed = await db.recomputeTask.findUniqueOrThrow({ where: { id: task.id }, select: { attempts: true } });
    const retry = failed.attempts < 3;
    const delay = failed.attempts === 1 ? 60_000 : failed.attempts === 2 ? 5 * 60_000 : 30 * 60_000;
    await db.recomputeTask.update({ where: { id: task.id }, data: { status: retry ? "PENDING" : "FAILED", error: error instanceof Error ? error.message : String(error), completedAt: retry ? null : new Date(), nextAttemptAt: retry ? new Date(Date.now() + delay) : null, leaseUntil: null } });
    throw error;
  }
}

export async function enqueueRecompute(candidateProfileId: string, profileVersion: number, force = false) {
  const existing = await db.recomputeTask.findUnique({ where: { candidateProfileId_profileVersion: { candidateProfileId, profileVersion } } });
  const task = existing && force && !["PENDING", "RUNNING"].includes(existing.status)
    ? await db.recomputeTask.update({ where: { id: existing.id }, data: { status: "PENDING", attempts: 0, progress: 0, processedItems: 0, totalItems: 0, error: null, startedAt: null, completedAt: null, nextAttemptAt: null, lockedAt: null, leaseUntil: null } })
    : existing ?? await db.recomputeTask.create({ data: { candidateProfileId, profileVersion } });
  try { after(() => processRecomputeTask(task.id).catch(() => undefined)); } catch {}
  return task;
}

export async function processRecomputeBacklog(limit = 5) {
  const now = new Date();
  const tasks = await db.recomputeTask.findMany({ where: { OR: [{ status: "PENDING", nextAttemptAt: null }, { status: "PENDING", nextAttemptAt: { lte: now } }, { status: "RUNNING", leaseUntil: { lt: now } }] }, orderBy: { createdAt: "asc" }, take: Math.max(1, Math.min(limit, 20)), select: { id: true } });
  const results = [];
  for (const task of tasks) results.push(await processRecomputeTask(task.id).catch((error) => ({ id: task.id, status: "FAILED", error: error instanceof Error ? error.message : String(error) })));
  return results;
}
