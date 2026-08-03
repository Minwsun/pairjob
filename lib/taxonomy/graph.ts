import { db } from "@/lib/db";

export type TaxonomyPath = {
  strength: number;
  hops: number;
  labelIds: string[];
  labels: string[];
  relations: string[];
};

export type HierarchyMatch = TaxonomyPath & { kind: "exact" | "equivalent" | "descendant" | "ancestor" | "related" | "transferable" };
export type OccupationSimilarity = TaxonomyPath & { kind: HierarchyMatch["kind"] | "shared_ancestor"; sharedConcepts: string[]; method: string };
export type TreeMembership = { rootId: string; path: string[]; coverage: number; confidence: number };

type GraphLink = { to: string; relation: string; weight: number; scoreCap?: number; maxHops?: number };
type HierarchyLink = { to: string; relation: string; confidence: number };

const canonicalRelation: Record<string, string> = {
  IS_A: "BROADER",
  RELATED_TO: "RELATED",
};

const relationWeight: Record<string, number> = {
  BROADER: .96,
  NARROWER: .94,
  EXACT_MATCH: .99,
  CLOSE_MATCH: .9,
  BROAD_MATCH: .78,
  NARROW_MATCH: .88,
  RELATED: .58,
  RELATED_MATCH: .62,
  PART_OF: .72,
  REQUIRES: .74,
  ESSENTIAL_SKILL: .82,
  OPTIONAL_SKILL: .64,
  PREFERRED_FOR: .62,
  TRANSFERABLE_TO: .7,
  USED_WITH: .5,
  APPLIED_IN: .56,
  COMBINES: .62,
  ENABLES: .5,
  REQUIRES_KNOWLEDGE: .5,
  DEMONSTRATED_BY: .72,
  PERFORMS_TASK: .68,
  ESSENTIAL_FOR: .78,
  OPTIONAL_FOR: .58,
  USES_TECHNOLOGY: .62,
  IMPLEMENTED_WITH: .64,
  PREREQUISITE_FOR: .56,
};

const equivalentRelations = new Set(["EXACT_MATCH"]);
const transferableRelations = new Set(["TRANSFERABLE_TO", "CLOSE_MATCH", "NARROW_MATCH"]);
const relatedRelations = new Set(["RELATED", "RELATED_MATCH", "USED_WITH", "APPLIED_IN", "COMBINES"]);

function normalizeRelation(relation: string) {
  return canonicalRelation[relation] ?? relation;
}

function compatibleTypes(candidateType?: string, requirementType?: string) {
  if (!candidateType || !requirementType) return false;
  if (candidateType === requirementType) return true;
  const skillLike = new Set(["skill", "tool", "knowledge"]);
  return skillLike.has(candidateType) && skillLike.has(requirementType);
}

export class TaxonomyGraph {
  private readonly pathCache = new Map<string, TaxonomyPath | null>();
  constructor(
    private readonly names: Map<string, string>,
    private readonly links: Map<string, GraphLink[]>,
    private readonly broader: Map<string, HierarchyLink[]>,
    private readonly types = new Map<string, string>(),
  ) {}

  ancestorPath(fromId: string, ancestorId: string, maxHops = 8): TaxonomyPath | null {
    if (!fromId || !ancestorId || !this.names.has(fromId) || !this.names.has(ancestorId)) return null;
    const queue = [{ id: fromId, strength: 1, ids: [fromId], relations: [] as string[] }];
    const best = new Map<string, number>([[fromId, 1]]);
    while (queue.length) {
      const current = queue.shift()!;
      if (current.id === ancestorId) return {
        strength: current.strength,
        hops: current.relations.length,
        labelIds: current.ids,
        labels: current.ids.map((id) => this.names.get(id) ?? id),
        relations: current.relations,
      };
      if (current.relations.length >= maxHops) continue;
      for (const link of this.broader.get(current.id) ?? []) {
        if (current.ids.includes(link.to)) continue;
        const strength = current.strength * link.confidence * (current.relations.length ? .97 : 1);
        if (strength <= (best.get(link.to) ?? 0)) continue;
        best.set(link.to, strength);
        queue.push({ id: link.to, strength, ids: [...current.ids, link.to], relations: [...current.relations, link.relation] });
      }
    }
    return null;
  }

  hierarchyMatch(candidateId: string, requirementId: string): HierarchyMatch | null {
    if (candidateId === requirementId) return { strength: 1, hops: 0, labelIds: [candidateId], labels: [this.names.get(candidateId) ?? candidateId], relations: [], kind: "exact" };
    if (!compatibleTypes(this.types.get(candidateId), this.types.get(requirementId))) return null;
    const equivalent = this.path(candidateId, requirementId, 2, equivalentRelations);
    if (equivalent) return { ...equivalent, strength: Math.max(.94, equivalent.strength), kind: "equivalent" };
    const descendant = this.ancestorPath(candidateId, requirementId);
    if (descendant) return { ...descendant, strength: Math.max(.86, Math.min(.94, descendant.strength)), kind: "descendant" };
    const ancestor = this.ancestorPath(requirementId, candidateId);
    if (ancestor) return { ...ancestor, labelIds: [...ancestor.labelIds].reverse(), labels: [...ancestor.labels].reverse(), relations: [...ancestor.relations].reverse(), strength: Math.max(.45, ancestor.strength * .72), kind: "ancestor" };
    const transferable = this.path(candidateId, requirementId, 2, transferableRelations);
    if (transferable) return { ...transferable, strength: Math.max(.45, Math.min(.78, transferable.strength)), kind: "transferable" };
    const related = this.path(candidateId, requirementId, 2, relatedRelations);
    return related ? { ...related, strength: Math.max(.25, Math.min(.58, related.strength)), kind: "related" } : null;
  }

  occupationSimilarity(candidateId: string, requirementId: string): OccupationSimilarity | null {
    const direct = this.hierarchyMatch(candidateId, requirementId);
    if (direct) return { ...direct, sharedConcepts: direct.kind === "exact" ? direct.labels : [], method: `graph_${direct.kind}` };
    if (this.types.get(candidateId) !== "occupation" || this.types.get(requirementId) !== "occupation") return null;
    const candidateAncestors = this.ancestorPaths(candidateId, 8);
    const requirementAncestors = this.ancestorPaths(requirementId, 8);
    const shared = [...candidateAncestors.entries()].flatMap(([id, candidatePath]) => {
      const requirementPath = requirementAncestors.get(id);
      if (!requirementPath) return [];
      const totalHops = candidatePath.hops + requirementPath.hops;
      if (!totalHops) return [];
      const specificity = Math.max(.35, 1 - Math.max(candidatePath.hops, requirementPath.hops) * .08);
      const strength = Math.max(.3, Math.min(.78, candidatePath.strength * requirementPath.strength * specificity * (.88 ** Math.max(0, totalHops - 2))));
      return [{ id, candidatePath, requirementPath, totalHops, strength }];
    }).sort((left, right) => right.strength - left.strength || left.totalHops - right.totalHops)[0];
    if (!shared) return null;
    const sharedType = this.types.get(shared.id);
    const tier = sharedType === "specialization" ? "branch" : sharedType === "field" ? "family" : "sector";
    const floor = tier === "branch" ? .72 : tier === "family" ? .5 : .36;
    const candidateToShared = shared.candidatePath.labelIds;
    const sharedToRequirement = [...shared.requirementPath.labelIds].reverse().slice(1);
    const labelIds = [...candidateToShared, ...sharedToRequirement];
    return { strength: Math.max(floor, shared.strength), hops: labelIds.length - 1, labelIds, labels: labelIds.map((id) => this.names.get(id) ?? id), relations: [...shared.candidatePath.relations, ...[...shared.requirementPath.relations].reverse().map(() => "NARROWER")], kind: "shared_ancestor", sharedConcepts: [this.names.get(shared.id) ?? shared.id], method: `shared_${tier}` };
  }

  private ancestorPaths(fromId: string, maxHops: number) {
    const paths = new Map<string, TaxonomyPath>();
    const queue = [{ id: fromId, strength: 1, ids: [fromId], relations: [] as string[] }];
    while (queue.length) {
      const current = queue.shift()!;
      const path = { strength: current.strength, hops: current.relations.length, labelIds: current.ids, labels: current.ids.map((id) => this.names.get(id) ?? id), relations: current.relations };
      if (current.strength > (paths.get(current.id)?.strength ?? -1)) paths.set(current.id, path);
      if (current.relations.length >= maxHops) continue;
      for (const parent of this.broader.get(current.id) ?? []) {
        if (current.ids.includes(parent.to)) continue;
        queue.push({ id: parent.to, strength: current.strength * parent.confidence * (current.relations.length ? .97 : 1), ids: [...current.ids, parent.to], relations: [...current.relations, parent.relation] });
      }
    }
    return paths;
  }

  rootPath(labelId: string): TaxonomyPath | null {
    if (!this.names.has(labelId)) return null;
    const queue = [{ id: labelId, ids: [labelId], relations: [] as string[], strength: 1 }];
    const completed: typeof queue = [];
    while (queue.length) {
      const current = queue.shift()!;
      const parents = this.broader.get(current.id) ?? [];
      if (!parents.length || current.ids.length >= 16) { completed.push(current); continue; }
      for (const parent of parents) {
        if (current.ids.includes(parent.to)) continue;
        queue.push({ id: parent.to, ids: [...current.ids, parent.to], relations: [...current.relations, parent.relation], strength: current.strength * parent.confidence });
      }
    }
    const best = completed.sort((left, right) => right.strength - left.strength || right.ids.length - left.ids.length)[0];
    if (!best) return null;
    const ordered = [...best.ids].reverse();
    return { strength: best.strength, hops: best.relations.length, labelIds: ordered, labels: ordered.map((id) => this.names.get(id) ?? id), relations: [...best.relations].reverse() };
  }

  topTrees(labelIds: string[], weights: Record<string, number> = {}, limit = 3): TreeMembership[] {
    const trees = new Map<string, { path: string[]; coverage: number; hits: number; confidence: number }>();
    for (const id of [...new Set(labelIds)]) {
      const path = this.rootPath(id);
      if (!path) continue;
      const rootId = path.labelIds[0];
      const current = trees.get(rootId) ?? { path: path.labels, coverage: 0, hits: 0, confidence: 0 };
      current.coverage += weights[id] ?? 1;
      current.hits++;
      current.confidence += path.strength;
      if (path.labels.length > current.path.length) current.path = path.labels;
      trees.set(rootId, current);
    }
    const total = [...trees.values()].reduce((sum, item) => sum + item.coverage, 0) || 1;
    return [...trees].map(([rootId, item]) => ({ rootId, path: item.path, coverage: item.coverage / total, confidence: Math.min(1, item.confidence / item.hits) })).sort((a, b) => b.coverage - a.coverage).slice(0, limit);
  }

  path(fromId: string, toId: string, maxHops = 3, allowedRelations?: ReadonlySet<string>): TaxonomyPath | null {
    const policy = allowedRelations ? [...allowedRelations].sort().join(",") : "all";
    const cacheKey = `${fromId}|${toId}|${maxHops}|${policy}`;
    if (this.pathCache.has(cacheKey)) return this.pathCache.get(cacheKey)!;
    if (!fromId || !toId || !this.names.has(fromId) || !this.names.has(toId)) return null;
    const queue = [{ id: fromId, strength: 1, ids: [fromId], relations: [] as string[] }];
    const best = new Map<string, number>([[fromId, 1]]);
    let visited = 0;
    while (queue.length && visited < 5_000) {
      queue.sort((left, right) => right.strength - left.strength);
      const current = queue.shift()!;
      visited++;
      if (current.id === toId) {
        const winner = { strength: current.strength, hops: current.relations.length, labelIds: current.ids, labels: current.ids.map((id) => this.names.get(id) ?? id), relations: current.relations };
        this.pathCache.set(cacheKey, winner);
        return winner;
      }
      if (current.relations.length >= maxHops) continue;
      for (const link of this.links.get(current.id) ?? []) {
        if (allowedRelations && !allowedRelations.has(link.relation)) continue;
        if (current.relations.length + 1 > (link.maxHops ?? maxHops)) continue;
        if (current.ids.includes(link.to)) continue;
        const strength = Math.min(link.scoreCap ?? 1, current.strength * link.weight * (current.relations.length ? .9 : 1));
        if (strength <= (best.get(link.to) ?? 0)) continue;
        best.set(link.to, strength);
        queue.push({ id: link.to, strength, ids: [...current.ids, link.to], relations: [...current.relations, link.relation] });
      }
    }
    this.pathCache.set(cacheKey, null);
    return null;
  }
}

let cachedGraph: { graph: TaxonomyGraph; expiresAt: number } | null = null;
let graphPromise: Promise<TaxonomyGraph> | null = null;

export function invalidateTaxonomyGraph() {
  cachedGraph = null;
}

export async function loadTaxonomyGraph() {
  if (cachedGraph && cachedGraph.expiresAt > Date.now()) return cachedGraph.graph;
  if (graphPromise) return graphPromise;
  graphPromise = buildTaxonomyGraph();
  try {
    const graph = await graphPromise;
    cachedGraph = { graph, expiresAt: Date.now() + 15 * 60_000 };
    return graph;
  } finally {
    graphPromise = null;
  }
}

async function buildTaxonomyGraph() {
  const [labels, edges] = await Promise.all([
    db.taxonomyLabel.findMany({ where: { status: "ACTIVE" }, select: { id: true, preferredName: true, parentId: true, type: true } }),
    db.taxonomyEdge.findMany({ where: { status: "ACTIVE" }, select: { fromId: true, toId: true, relation: true, confidence: true, scoreCap: true, maxHops: true } }),
  ]);
  const names = new Map(labels.map((label) => [label.id, label.preferredName]));
  const links = new Map<string, GraphLink[]>();
  const broader = new Map<string, HierarchyLink[]>();
  const addLink = (from: string, to: string, relation: string, weight: number, scoreCap = 1, maxHops = 1) => links.set(from, [...(links.get(from) ?? []), { to, relation, weight, scoreCap, maxHops }]);
  const addBroader = (from: string, to: string, relation: string, confidence: number) => broader.set(from, [...(broader.get(from) ?? []), { to, relation, confidence }]);
  for (const edge of edges) {
    const relation = normalizeRelation(edge.relation);
    const weight = (relationWeight[relation] ?? .5) * edge.confidence;
    if (relation === "BROADER") {
      addBroader(edge.fromId, edge.toId, relation, edge.confidence);
      addLink(edge.fromId, edge.toId, relation, weight, edge.scoreCap, Math.max(1, edge.maxHops));
      addLink(edge.toId, edge.fromId, "NARROWER", relationWeight.NARROWER * edge.confidence, edge.scoreCap, Math.max(1, edge.maxHops));
    } else if (relation === "NARROWER") {
      addBroader(edge.toId, edge.fromId, "BROADER", edge.confidence);
      addLink(edge.fromId, edge.toId, relation, weight, edge.scoreCap, Math.max(1, edge.maxHops));
      addLink(edge.toId, edge.fromId, "BROADER", relationWeight.BROADER * edge.confidence, edge.scoreCap, Math.max(1, edge.maxHops));
    } else {
      addLink(edge.fromId, edge.toId, relation, weight, edge.scoreCap, Math.max(1, edge.maxHops));
      if (!["BROAD_MATCH", "NARROW_MATCH", "REQUIRES", "REQUIRES_KNOWLEDGE", "ENABLES", "DEMONSTRATED_BY", "ESSENTIAL_SKILL", "OPTIONAL_SKILL", "ESSENTIAL_FOR", "OPTIONAL_FOR", "PERFORMS_TASK", "USES_TECHNOLOGY", "IMPLEMENTED_WITH", "PREREQUISITE_FOR"].includes(relation)) addLink(edge.toId, edge.fromId, relation, weight, edge.scoreCap, Math.max(1, edge.maxHops));
    }
  }
  for (const label of labels) if (label.parentId && !(broader.get(label.id) ?? []).some((link) => link.to === label.parentId)) {
    addBroader(label.id, label.parentId, "BROADER", .9);
    addLink(label.id, label.parentId, "BROADER", relationWeight.BROADER * .9, .94, 8);
    addLink(label.parentId, label.id, "NARROWER", relationWeight.NARROWER * .9, .94, 8);
  }
  return new TaxonomyGraph(names, links, broader, new Map(labels.map((label) => [label.id, label.type])));
}
