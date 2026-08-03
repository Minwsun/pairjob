import { db } from "@/lib/db";

export function normalizeTaxonomyText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim().replace(/\s+/g, " ");
}

function distance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  for (let column = 0; column <= right.length; column++) rows[0][column] = column;
  for (let row = 1; row <= left.length; row++) for (let column = 1; column <= right.length; column++) rows[row][column] = left[row - 1] === right[column - 1] ? rows[row - 1][column - 1] : Math.min(rows[row - 1][column], rows[row][column - 1], rows[row - 1][column - 1]) + 1;
  return rows[left.length][right.length];
}

export async function findTaxonomyCandidates(rawText: string, type: string, limit = 5) {
  const normalized = normalizeTaxonomyText(rawText);
  const exact = await db.taxonomyAlias.findFirst({ where: { normalized, label: { type, status: "ACTIVE" } }, include: { label: true } });
  if (exact) return [{ label: exact.label, confidence: 1, method: exact.kind === "abbreviation" ? "abbreviation" : "exact_alias" }];
  const tokens = normalized.split(" ").filter((token) => token.length >= 3).sort((left, right) => right.length - left.length).slice(0, 3);
  const aliases = await db.taxonomyAlias.findMany({ where: { label: { type, status: "ACTIVE" }, ...(tokens.length ? { OR: tokens.map((token) => ({ normalized: { contains: token } })) } : {}) }, include: { label: true }, take: 1500 });
  return aliases.map((alias) => ({ label: alias.label, confidence: Math.max(0, 1 - distance(normalized, alias.normalized) / Math.max(normalized.length, alias.normalized.length, 1)), method: "fuzzy" })).sort((left, right) => right.confidence - left.confidence).filter((item, index, list) => item.confidence >= .45 && list.findIndex((candidate) => candidate.label.id === item.label.id) === index).slice(0, limit);
}

export type PhraseResolution = {
  rawText: string;
  relation: "single" | "concurrent" | "alternative";
  primary: Awaited<ReturnType<typeof findTaxonomyCandidates>>[number] | null;
  components: { rawText: string; candidate: Awaited<ReturnType<typeof findTaxonomyCandidates>>[number] }[];
  method: string;
};

export async function analyzeTaxonomyPhrase(rawText: string, type: string): Promise<PhraseResolution> {
  const exact = await findTaxonomyCandidates(rawText, type);
  if (exact[0]?.confidence === 1) return { rawText, relation: "single", primary: exact[0], components: [{ rawText, candidate: exact[0] }], method: exact[0].method };

  const source = rawText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hasAlternative = /\b(hoac|or)\b/.test(source);
  const hasConcurrent = /\b(va|and)\b/.test(source) || /[&+,/]/.test(source);
  if (!hasAlternative && !hasConcurrent) return { rawText, relation: "single", primary: exact[0] ?? null, components: exact[0] ? [{ rawText, candidate: exact[0] }] : [], method: exact[0]?.method ?? "unresolved" };

  const separator = hasAlternative ? /\s+(?:hoac|or)\s+/i : /\s+(?:va|and)\s+|\s*[&+,/]\s*/i;
  const fragments = source.split(separator).map((part) => normalizeTaxonomyText(part)).filter(Boolean);
  const resolved = (await Promise.all(fragments.map(async (fragment) => ({ rawText: fragment, candidates: await findTaxonomyCandidates(fragment, type) })))).filter((item) => item.candidates[0]).map((item) => ({ rawText: item.rawText, candidate: item.candidates[0] }));
  const ids = new Set(resolved.map((item) => item.candidate.label.id));
  if (!hasAlternative && type === "occupation" && ids.has("frontend_web_developer") && ids.has("backend_developer")) {
    const fullstack = (await findTaxonomyCandidates("fullstack", "occupation"))[0];
    return { rawText, relation: "concurrent", primary: fullstack ? { ...fullstack, confidence: Math.min(...resolved.map((item) => item.candidate.confidence)), method: "composition_rule" } : null, components: resolved, method: "composition_rule" };
  }
  return { rawText, relation: hasAlternative ? "alternative" : "concurrent", primary: resolved.length === 1 ? resolved[0].candidate : null, components: resolved, method: hasAlternative ? "alternative_components" : "compound_components" };
}
