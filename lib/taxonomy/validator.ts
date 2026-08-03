export type GraphLabel = { id: string; type: string; parentId: string | null };
export type GraphEdge = { fromId: string; toId: string; relation: string };
export type GraphValidationIssue = { code: "CYCLE" | "ORPHAN" | "SELF_EDGE" | "INVALID_RELATION" | "INVALID_HIERARCHY"; labelId?: string; edge?: GraphEdge };
export type GraphValidationResult = { valid: boolean; issues: GraphValidationIssue[] };

const relations = new Set(["IS_A", "BROADER", "NARROWER", "RELATED", "EXACT_MATCH", "CLOSE_MATCH", "BROAD_MATCH", "NARROW_MATCH", "RELATED_MATCH", "PART_OF", "REQUIRES", "REQUIRES_KNOWLEDGE", "ENABLES", "DEMONSTRATED_BY", "PERFORMS_TASK", "ESSENTIAL_FOR", "OPTIONAL_FOR", "USES_TECHNOLOGY", "IMPLEMENTED_WITH", "PREREQUISITE_FOR", "ESSENTIAL_SKILL", "OPTIONAL_SKILL", "PREFERRED_FOR", "RELATED_TO", "TRANSFERABLE_TO", "USED_WITH", "APPLIED_IN", "COMBINES"]);
const hierarchyTypes: Record<string, Set<string>> = {
  occupation: new Set(["root", "field", "specialization", "occupation"]),
  skill: new Set(["root", "field", "specialization", "skill_group", "skill"]),
  tool: new Set(["root", "field", "specialization", "skill_group", "tool"]),
  knowledge: new Set(["root", "field", "specialization", "skill_group", "knowledge"]),
  capability: new Set(["root", "field", "specialization", "capability_group", "capability"]),
  task: new Set(["root", "field", "specialization", "task_group", "task"]),
  domain: new Set(["root", "field", "domain_group", "domain"]),
};

export function isValidHierarchyParent(childType: string, parentType: string) {
  return !hierarchyTypes[childType] || hierarchyTypes[childType].has(parentType);
}

export function validateTaxonomyGraph(labels: GraphLabel[], edges: GraphEdge[]): GraphValidationResult {
  const byId = new Map(labels.map((label) => [label.id, label]));
  const issues: GraphValidationIssue[] = [];
  for (const label of labels) {
    if (label.parentId && !byId.has(label.parentId)) issues.push({ code: "ORPHAN", labelId: label.id });
    const parent = label.parentId ? byId.get(label.parentId) : null;
    if (parent && !isValidHierarchyParent(label.type, parent.type)) issues.push({ code: "INVALID_HIERARCHY", labelId: label.id });
    const seen = new Set<string>();
    let current: GraphLabel | undefined = label;
    while (current?.parentId) {
      if (seen.has(current.id)) { issues.push({ code: "CYCLE", labelId: label.id }); break; }
      seen.add(current.id);
      current = byId.get(current.parentId);
    }
  }
  for (const edge of edges) {
    if (edge.fromId === edge.toId) issues.push({ code: "SELF_EDGE", edge });
    if (!byId.has(edge.fromId) || !byId.has(edge.toId)) issues.push({ code: "ORPHAN", edge });
    if (!relations.has(edge.relation)) issues.push({ code: "INVALID_RELATION", edge });
  }
  const broader = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.relation === "IS_A" || edge.relation === "BROADER") broader.set(edge.fromId, [...(broader.get(edge.fromId) ?? []), edge.toId]);
    if (edge.relation === "NARROWER") broader.set(edge.toId, [...(broader.get(edge.toId) ?? []), edge.fromId]);
  }
  const visit = (start: string, current: string, path: Set<string>) => {
    if (path.has(current)) { issues.push({ code: "CYCLE", labelId: start }); return; }
    const nextPath = new Set(path).add(current);
    for (const parent of broader.get(current) ?? []) visit(start, parent, nextPath);
  };
  for (const label of labels) visit(label.id, label.id, new Set());
  return { valid: issues.length === 0, issues };
}
