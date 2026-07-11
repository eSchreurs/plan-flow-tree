import type { Dependency, ID, PlanItem } from "./types";
import type { Rect } from "./layout";

/**
 * Layered top-down layout for the dependency graph view. Hierarchy is
 * flattened away — only items that participate in at least one dependency
 * appear. Rows are longest-path layers (prerequisites above dependents);
 * within a row every node is horizontally centered on the average of its
 * prerequisites, then nodes are pushed apart to resolve overlaps.
 */

export const GRAPH_NODE_W = 200;
export const GRAPH_NODE_H = 44;
const GAP_X = 28;
const GAP_Y = 72;

export interface GraphLayout {
  rects: Map<ID, Rect>;
  /** Items shown in the graph, top row first. */
  ids: ID[];
}

export function layoutDependencyGraph(items: PlanItem[], deps: Dependency[]): GraphLayout {
  const involved = new Set<ID>();
  for (const dep of deps) {
    involved.add(dep.source);
    involved.add(dep.target);
  }
  const shown = items.filter((i) => involved.has(i.id));
  const shownIds = new Set(shown.map((i) => i.id));
  const rects = new Map<ID, Rect>();
  if (shown.length === 0) return { rects, ids: [] };

  const sourcesOf = new Map<ID, ID[]>();
  const edges: [ID, ID][] = [];
  for (const dep of deps) {
    if (!shownIds.has(dep.source) || !shownIds.has(dep.target)) continue;
    edges.push([dep.source, dep.target]);
    sourcesOf.set(dep.target, [...(sourcesOf.get(dep.target) ?? []), dep.source]);
  }

  // Longest-path layering (the dependency graph itself is acyclic, but stay
  // tolerant anyway with a capped relaxation).
  const layer = new Map<ID, number>(shown.map((i) => [i.id, 0]));
  const cap = shown.length - 1;
  for (let pass = 0; pass < shown.length; pass++) {
    let changed = false;
    for (const [from, to] of edges) {
      const proposed = Math.min(cap, (layer.get(from) ?? 0) + 1);
      if (proposed > (layer.get(to) ?? 0)) {
        layer.set(to, proposed);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const rows: PlanItem[][] = [];
  for (const item of shown) {
    const index = layer.get(item.id) ?? 0;
    (rows[index] ??= []).push(item);
  }

  const xs = new Map<ID, number>();
  const centerOf = (id: ID) => xs.get(id)! + GRAPH_NODE_W / 2;
  rows.forEach((row, rowIndex) => {
    if (!row) return;
    if (rowIndex === 0) {
      let x = 0;
      for (const item of row) {
        xs.set(item.id, x);
        x += GRAPH_NODE_W + GAP_X;
      }
      return;
    }
    const order = new Map(row.map((item, i) => [item.id, i]));
    const desired = row.map((item) => {
      const sources = (sourcesOf.get(item.id) ?? []).filter(
        (src) => (layer.get(src) ?? 0) < rowIndex && xs.has(src),
      );
      if (sources.length === 0) return { item, x: null as number | null };
      const avg = sources.reduce((sum, src) => sum + centerOf(src), 0) / sources.length;
      return { item, x: avg - GRAPH_NODE_W / 2 };
    });
    desired.sort((a, b) => {
      const ax = a.x ?? Number.POSITIVE_INFINITY;
      const bx = b.x ?? Number.POSITIVE_INFINITY;
      return ax - bx || order.get(a.item.id)! - order.get(b.item.id)!;
    });
    let cursor = Number.NEGATIVE_INFINITY;
    for (const { item, x } of desired) {
      const target = x ?? (cursor === Number.NEGATIVE_INFINITY ? 0 : cursor);
      const left = Math.max(target, cursor);
      xs.set(item.id, left);
      cursor = left + GRAPH_NODE_W + GAP_X;
    }
  });

  let minX = Number.POSITIVE_INFINITY;
  for (const item of shown) minX = Math.min(minX, xs.get(item.id)!);
  const orderedIds: ID[] = [];
  rows.forEach((row, rowIndex) => {
    if (!row) return;
    for (const item of row) {
      rects.set(item.id, {
        x: xs.get(item.id)! - minX,
        y: rowIndex * (GRAPH_NODE_H + GAP_Y),
        w: GRAPH_NODE_W,
        h: GRAPH_NODE_H,
      });
      orderedIds.push(item.id);
    }
  });
  return { rects, ids: orderedIds };
}
