import { db } from "@/lib/db";
import { embedTexts, embeddingModel } from "@/lib/embeddings/local";

const vector = (values: number[]) => `[${values.join(",")}]`;

export async function refreshJobEmbedding(jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { searchDocument: true } });
  if (!job?.searchDocument) return;
  const [embedding, queryEmbedding] = await embedTexts([`passage: ${job.searchDocument}`, `query: ${job.searchDocument}`]);
  await db.$executeRawUnsafe(`UPDATE "Job" SET "embedding"=$1::vector, "queryEmbedding"=$2::vector, "embeddingModel"=$3, "embeddingUpdatedAt"=NOW() WHERE id=$4`, vector(embedding), vector(queryEmbedding), embeddingModel, jobId);
}

export async function refreshCandidateEmbedding(candidateProfileId: string) {
  const profile = await db.candidateProfile.findUnique({ where: { id: candidateProfileId }, select: { searchDocument: true } });
  if (!profile?.searchDocument) return;
  const [embedding, queryEmbedding] = await embedTexts([`passage: ${profile.searchDocument}`, `query: ${profile.searchDocument}`]);
  await db.$executeRawUnsafe(`UPDATE "CandidateProfile" SET "embedding"=$1::vector, "queryEmbedding"=$2::vector, "embeddingModel"=$3, "embeddingUpdatedAt"=NOW() WHERE id=$4`, vector(embedding), vector(queryEmbedding), embeddingModel, candidateProfileId);
}
