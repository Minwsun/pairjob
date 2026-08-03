import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type RetrievalSignal = { channel: "exact" | "taxonomy" | "fts" | "vector" | "fallback"; rank: number; score: number };
export type RetrievedEntity = { id: string; score: number; signals: RetrievalSignal[] };

const RRF_K = 60;
const CHANNEL_WEIGHT: Record<RetrievalSignal["channel"], number> = { exact: 1.2, taxonomy: 1.1, fts: 1, vector: 1.15, fallback: 0 };
type RankedRow = { id: string; score: number };

function fuse(channels: { channel: RetrievalSignal["channel"]; rows: RankedRow[] }[], limit: number, catalog: RankedRow[] = []) {
  const fused = new Map<string, RetrievedEntity>();
  for (const { channel, rows } of channels) rows.forEach((row, index) => {
    const rank = index + 1;
    const item = fused.get(row.id) ?? { id: row.id, score: 0, signals: [] };
    item.score += CHANNEL_WEIGHT[channel] / (RRF_K + rank);
    item.signals.push({ channel, rank, score: Number(row.score) });
    fused.set(row.id, item);
  });
  const maximum = channels.reduce((sum, item) => sum + CHANNEL_WEIGHT[item.channel] / (RRF_K + 1), 0);
  const ranked = [...fused.values()].sort((left, right) => right.score - left.score).map((item) => ({ ...item, score: Math.min(100, item.score / Math.max(maximum, .0001) * 100) }));
  for (const row of catalog) if (ranked.length < limit && !fused.has(row.id)) ranked.push({ id: row.id, score: 0, signals: [] });
  return ranked.slice(0, limit);
}

const CHANNEL_LIMIT = 120;

export async function retrieveCandidates(jobId: string, limit = 250) {
  const [exact, taxonomy, fts, vector, catalog] = await Promise.all([
    db.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH q AS (SELECT "requiredSkills", occupation FROM "Job" WHERE id = ${jobId})
      SELECT * FROM (SELECT c.id,
        ((SELECT count(*) FROM jsonb_array_elements(c.skills) cs
          WHERE cs->>'id' IN (SELECT js->>'id' FROM q, jsonb_array_elements(q."requiredSkills") js))
         + CASE WHEN c.occupation = q.occupation THEN 2 ELSE 0 END)::float AS score
      FROM "CandidateProfile" c CROSS JOIN q
      WHERE c.verified = true) ranked WHERE score > 0
      ORDER BY score DESC
      LIMIT ${CHANNEL_LIMIT}`),
    db.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH RECURSIVE q AS (SELECT "requiredSkills", occupation FROM "Job" WHERE id = ${jobId}),
      requirements AS (SELECT js->>'id' id FROM q, jsonb_array_elements(q."requiredSkills") js UNION SELECT occupation FROM q WHERE occupation IS NOT NULL),
      paths(root_id, target_id, score, depth, visited) AS (
        SELECT id, id, 1::float, 0, ARRAY[id] FROM requirements
        UNION ALL
        SELECT p.root_id,
          CASE WHEN e."fromId" = p.target_id THEN e."toId" ELSE e."fromId" END,
          LEAST(e."scoreCap", p.score * e.confidence * CASE e.relation
            WHEN 'EXACT_MATCH' THEN .99 WHEN 'CLOSE_MATCH' THEN .9 WHEN 'BROADER' THEN .88 WHEN 'NARROWER' THEN .86
            WHEN 'ESSENTIAL_SKILL' THEN .84 WHEN 'REQUIRES' THEN .78 WHEN 'USES_TECHNOLOGY' THEN .72
            WHEN 'TRANSFERABLE_TO' THEN .68 WHEN 'RELATED' THEN .58 WHEN 'RELATED_MATCH' THEN .62 ELSE .52 END * CASE WHEN p.depth = 0 THEN 1 ELSE .82 END),
          p.depth + 1,
          p.visited || CASE WHEN e."fromId" = p.target_id THEN e."toId" ELSE e."fromId" END
        FROM paths p JOIN "TaxonomyEdge" e ON e.status = 'ACTIVE' AND (e."fromId" = p.target_id OR e."toId" = p.target_id)
        WHERE p.depth < 3 AND e.confidence >= .55
          AND NOT (CASE WHEN e."fromId" = p.target_id THEN e."toId" ELSE e."fromId" END = ANY(p.visited))
      ),
      candidate_labels AS (SELECT c.id candidate_id, cs->>'id' label_id FROM "CandidateProfile" c, jsonb_array_elements(c.skills) cs WHERE c.verified = true UNION ALL SELECT id, occupation FROM "CandidateProfile" WHERE verified = true AND occupation IS NOT NULL)
      SELECT cl.candidate_id id, max(p.score)::float score
      FROM candidate_labels cl JOIN paths p ON p.target_id = cl.label_id
      WHERE p.score >= .2
      GROUP BY cl.candidate_id ORDER BY score DESC LIMIT ${CHANNEL_LIMIT}`),
    db.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH q AS (SELECT to_tsquery('simple', array_to_string(tsvector_to_array(to_tsvector('simple', "searchDocument")), ' | ')) query FROM "Job" WHERE id = ${jobId})
      SELECT c.id, ts_rank_cd(c."searchVector", q.query)::float score
      FROM "CandidateProfile" c CROSS JOIN q
      WHERE c.verified = true AND q.query <> ''::tsquery AND c."searchVector" @@ q.query
      ORDER BY score DESC LIMIT ${CHANNEL_LIMIT}`),
    db.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH q AS (SELECT "queryEmbedding" FROM "Job" WHERE id = ${jobId})
      SELECT c.id, (1 - (c.embedding <=> q."queryEmbedding"))::float score
      FROM "CandidateProfile" c CROSS JOIN q
      WHERE c.verified = true AND c.embedding IS NOT NULL AND q."queryEmbedding" IS NOT NULL
      ORDER BY c.embedding <=> q."queryEmbedding" LIMIT ${CHANNEL_LIMIT}`),
    db.$queryRaw<RankedRow[]>(Prisma.sql`SELECT id, 0::float score FROM "CandidateProfile" WHERE verified = true ORDER BY "updatedAt" DESC LIMIT ${limit}`),
  ]);
  return fuse([{ channel: "exact", rows: exact }, { channel: "taxonomy", rows: taxonomy }, { channel: "fts", rows: fts }, { channel: "vector", rows: vector }], limit, catalog);
}

export async function retrieveJobs(candidateProfileId: string, limit = 250) {
  const [exact, taxonomy, fts, vector, catalog] = await Promise.all([
    db.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH q AS (SELECT skills, occupation FROM "CandidateProfile" WHERE id = ${candidateProfileId})
      SELECT * FROM (SELECT j.id,
        ((SELECT count(*) FROM jsonb_array_elements(j."requiredSkills") js
          WHERE js->>'id' IN (SELECT cs->>'id' FROM q, jsonb_array_elements(q.skills) cs))
         + CASE WHEN j.occupation = q.occupation THEN 2 ELSE 0 END)::float AS score
      FROM "Job" j CROSS JOIN q
      WHERE j.published = true) ranked WHERE score > 0
      ORDER BY score DESC
      LIMIT ${CHANNEL_LIMIT}`),
    db.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH RECURSIVE q AS (SELECT skills, occupation FROM "CandidateProfile" WHERE id = ${candidateProfileId}),
      candidate_labels AS (SELECT cs->>'id' id FROM q, jsonb_array_elements(q.skills) cs UNION SELECT occupation FROM q WHERE occupation IS NOT NULL),
      paths(root_id, target_id, score, depth, visited) AS (
        SELECT id, id, 1::float, 0, ARRAY[id] FROM candidate_labels
        UNION ALL
        SELECT p.root_id,
          CASE WHEN e."fromId" = p.target_id THEN e."toId" ELSE e."fromId" END,
          LEAST(e."scoreCap", p.score * e.confidence * CASE e.relation
            WHEN 'EXACT_MATCH' THEN .99 WHEN 'CLOSE_MATCH' THEN .9 WHEN 'BROADER' THEN .88 WHEN 'NARROWER' THEN .86
            WHEN 'ESSENTIAL_SKILL' THEN .84 WHEN 'REQUIRES' THEN .78 WHEN 'USES_TECHNOLOGY' THEN .72
            WHEN 'TRANSFERABLE_TO' THEN .68 WHEN 'RELATED' THEN .58 WHEN 'RELATED_MATCH' THEN .62 ELSE .52 END * CASE WHEN p.depth = 0 THEN 1 ELSE .82 END),
          p.depth + 1,
          p.visited || CASE WHEN e."fromId" = p.target_id THEN e."toId" ELSE e."fromId" END
        FROM paths p JOIN "TaxonomyEdge" e ON e.status = 'ACTIVE' AND (e."fromId" = p.target_id OR e."toId" = p.target_id)
        WHERE p.depth < 3 AND e.confidence >= .55
          AND NOT (CASE WHEN e."fromId" = p.target_id THEN e."toId" ELSE e."fromId" END = ANY(p.visited))
      ),
      job_labels AS (SELECT j.id job_id, js->>'id' label_id FROM "Job" j, jsonb_array_elements(j."requiredSkills") js WHERE j.published = true UNION ALL SELECT id, occupation FROM "Job" WHERE published = true AND occupation IS NOT NULL)
      SELECT jl.job_id id, max(p.score)::float score
      FROM job_labels jl JOIN paths p ON p.target_id = jl.label_id
      WHERE p.score >= .2
      GROUP BY jl.job_id ORDER BY score DESC LIMIT ${CHANNEL_LIMIT}`),
    db.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH q AS (SELECT to_tsquery('simple', array_to_string(tsvector_to_array(to_tsvector('simple', "searchDocument")), ' | ')) query FROM "CandidateProfile" WHERE id = ${candidateProfileId})
      SELECT j.id, ts_rank_cd(j."searchVector", q.query)::float score
      FROM "Job" j CROSS JOIN q
      WHERE j.published = true AND q.query <> ''::tsquery AND j."searchVector" @@ q.query
      ORDER BY score DESC LIMIT ${CHANNEL_LIMIT}`),
    db.$queryRaw<RankedRow[]>(Prisma.sql`
      WITH q AS (SELECT "queryEmbedding" FROM "CandidateProfile" WHERE id = ${candidateProfileId})
      SELECT j.id, (1 - (j.embedding <=> q."queryEmbedding"))::float score
      FROM "Job" j CROSS JOIN q
      WHERE j.published = true AND j.embedding IS NOT NULL AND q."queryEmbedding" IS NOT NULL
      ORDER BY j.embedding <=> q."queryEmbedding" LIMIT ${CHANNEL_LIMIT}`),
    db.$queryRaw<RankedRow[]>(Prisma.sql`SELECT id, 0::float score FROM "Job" WHERE published = true ORDER BY "updatedAt" DESC LIMIT ${limit}`),
  ]);
  return fuse([{ channel: "exact", rows: exact }, { channel: "taxonomy", rows: taxonomy }, { channel: "fts", rows: fts }, { channel: "vector", rows: vector }], limit, catalog);
}
