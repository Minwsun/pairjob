export const embeddingModel = "pairjob-hash-384-v1";

function hashEmbedding(text: string) {
  const dimensions = 384;
  const vector = Array<number>(dimensions).fill(0);
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const features = [...normalized.split(/[^a-z0-9+#.]+/).filter(Boolean), ...Array.from({ length: Math.max(0, normalized.length - 2) }, (_, index) => normalized.slice(index, index + 3))];
  for (const feature of features) {
    let hash = 2166136261;
    for (let index = 0; index < feature.length; index++) hash = Math.imul(hash ^ feature.charCodeAt(index), 16777619);
    vector[(hash >>> 0) % dimensions] += (hash & 1) ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export async function embedTexts(texts: string[]) {
  if (!texts.length) return [];
  return texts.map(hashEmbedding);
}
