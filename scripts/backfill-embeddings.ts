import { db } from "../lib/db";
import { embedTexts, embeddingModel } from "../lib/embeddings/local";
import { candidateSearchDocument, jobSearchDocument } from "../lib/embeddings/documents";

const vector = (values: number[]) => `[${values.join(",")}]`;

async function updateBatch(kind: "job" | "candidate", rows: any[]) {
  const documents = rows.map(kind === "job" ? jobSearchDocument : candidateSearchDocument);
  const vectors = await embedTexts(documents.flatMap((text) => [`passage: ${text}`, `query: ${text}`]));
  const passages = rows.map((_, index) => vectors[index * 2]); const queries = rows.map((_, index) => vectors[index * 2 + 1]);
  for (let index = 0; index < rows.length; index++) {
    if (kind === "job") await db.$executeRawUnsafe(`UPDATE "Job" SET "searchDocument"=$1, "embedding"=$2::vector, "queryEmbedding"=$3::vector, "embeddingModel"=$4, "embeddingUpdatedAt"=NOW() WHERE id=$5`, documents[index], vector(passages[index]), vector(queries[index]), embeddingModel, rows[index].id);
    else await db.$executeRawUnsafe(`UPDATE "CandidateProfile" SET "searchDocument"=$1, "embedding"=$2::vector, "queryEmbedding"=$3::vector, "embeddingModel"=$4, "embeddingUpdatedAt"=NOW() WHERE id=$5`, documents[index], vector(passages[index]), vector(queries[index]), embeddingModel, rows[index].id);
  }
}

async function main() {
  const [jobs, candidates] = await Promise.all([db.job.findMany(), db.candidateProfile.findMany()]);
  for (let index = 0; index < jobs.length; index += 32) { await updateBatch("job", jobs.slice(index, index + 32)); console.log(`Embedded jobs ${Math.min(index + 32, jobs.length)}/${jobs.length}`); }
  for (let index = 0; index < candidates.length; index += 32) { await updateBatch("candidate", candidates.slice(index, index + 32)); console.log(`Embedded candidates ${Math.min(index + 32, candidates.length)}/${candidates.length}`); }
}

main().finally(() => db.$disconnect());
