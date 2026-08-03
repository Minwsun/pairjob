import { normalizeTaxonomyText } from "@/lib/taxonomy/service";

type Mapping = { id: string; rawText: string; interpretedText: string | null; taxonomyLabel?: { preferredName: string } | null };

export function matchingSkillMappingIds(mappings: Mapping[], value: string) {
  const target = normalizeTaxonomyText(value);
  const exact = mappings.filter((mapping) => [mapping.rawText, mapping.interpretedText, mapping.taxonomyLabel?.preferredName].some((item) => item && normalizeTaxonomyText(item) === target));
  if (exact.length) return exact.map((mapping) => mapping.id);
  const partial = mappings.filter((mapping) => [mapping.rawText, mapping.interpretedText, mapping.taxonomyLabel?.preferredName].some((item) => {
    const normalized = item ? normalizeTaxonomyText(item) : "";
    return normalized.length >= 4 && target.length >= 4 && (normalized.includes(target) || target.includes(normalized));
  }));
  return partial.length === 1 ? [partial[0].id] : [];
}

export function safeRequirementType(value: unknown) {
  return value === "required" || value === "preferred" || value === "not_required" ? value : "preferred";
}
