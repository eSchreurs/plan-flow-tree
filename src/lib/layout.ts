import type { Dependency, ID, PlanItem } from "./types";
import { childrenMap, itemMap } from "./logic";

/**
 * Deterministic auto-layout. Recomputed from scratch on every change so the
 * canvas always resolves to a clean hierarchic overview:
 *
 *  - Siblings are arranged into dependency layers (longest-path): anything a
 *    sibling waits on sits in a column to its left, giving a left→right
 *    timeline. Dependencies between *descendants* of two siblings order those
 *    siblings the same way.
 *  - Siblings within a layer stack vertically.
 *  - Categories are containers: their children are laid out inside the box.
 *  - Other items place their children below themselves, slightly indented,
 *    forming a tree.
 */

export const NODE_W = 240;
export const CAT_HEADER_H = 44;

const CAT_PAD_X = 16;
const CAT_PAD_TOP = 12;
const CAT_PAD_BOTTOM = 16;
const CAT_MIN_INNER_W = NODE_W;
const CAT_EMPTY_INNER_H = 56;
const GAP_X = 64; // between dependency layers
const GAP_Y = 16; // between stacked sibling blocks
const INDENT = 28; // tree indent for children of non-category items
const CHILD_GAP = 20; // parent node bottom → children top

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  /** Absolute canvas rect per item. For categories this is the whole box. */
  rects: Map<ID, Rect>;
  /** Nearest category ancestor per item (categories become React Flow groups). */
  containerOf: Map<ID, ID | null>;
}

export function nodeHeight(item: PlanItem): number {
  const desc = item.description.trim().length > 0;
  switch (item.type) {
    case "task":
      return desc ? 68 : 46;
    case "phase":
      return desc ? 66 : 44;
    case "requirement":
      return desc ? 68 : 46;
    case "category":
      return CAT_HEADER_H;
  }
}

interface Block {
  w: number;
  h: number;
  place: (x: number, y: number) => void;
}

export function layoutProject(items: PlanItem[], deps: Dependency[]): LayoutResult {
  const byId = itemMap(items);
  const children = childrenMap(items);
  const rects = new Map<ID, Rect>();

  // Ancestor chains let us lift a dependency endpoint to the sibling that
  // contains it within a given scope.
  const ancestry = new Map<ID, ID[]>(); // item → [self, parent, grandparent, ...]
  const chainOf = (id: ID): ID[] => {
    const cached = ancestry.get(id);
    if (cached) return cached;
    const chain: ID[] = [];
    let current: PlanItem | undefined = byId.get(id);
    const guard = new Set<ID>();
    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      chain.push(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    ancestry.set(id, chain);
    return chain;
  };
  const parentOf = (id: ID): ID | null => byId.get(id)?.parentId ?? null;
  /** The sibling under `scope` whose subtree contains `id` (or null). */
  const liftTo = (scope: ID | null, id: ID): ID | null => {
    for (const ancestor of chainOf(id)) {
      if (parentOf(ancestor) === scope) return ancestor;
    }
    return null;
  };

  /** Longest-path layer per sibling, tolerant of projected cycles. */
  const layerSiblings = (scope: ID | null, siblings: PlanItem[]): Map<ID, number> => {
    const siblingIds = new Set(siblings.map((s) => s.id));
    const edges = new Set<string>();
    const adjacency = new Map<ID, ID[]>();
    for (const dep of deps) {
      const from = liftTo(scope, dep.source);
      const to = liftTo(scope, dep.target);
      if (!from || !to || from === to) continue;
      if (!siblingIds.has(from) || !siblingIds.has(to)) continue;
      const key = `${from}→${to}`;
      if (edges.has(key)) continue;
      edges.add(key);
      const list = adjacency.get(from) ?? [];
      list.push(to);
      adjacency.set(from, list);
    }

    // Iterative relaxation, capped: projected sibling graphs can contain
    // cycles even when the real dependency graph is deadlock-free (tasks of
    // two phases feeding each other), so plain topological sort won't do.
    const layer = new Map<ID, number>(siblings.map((s) => [s.id, 0]));
    const cap = siblings.length - 1;
    for (let pass = 0; pass < siblings.length; pass++) {
      let changed = false;
      for (const [from, targets] of adjacency) {
        for (const to of targets) {
          const proposed = Math.min(cap, (layer.get(from) ?? 0) + 1);
          if (proposed > (layer.get(to) ?? 0)) {
            layer.set(to, proposed);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return layer;
  };

  /** Lay out all children of `scope` into columns; block spans them all. */
  const layoutScope = (scope: ID | null): Block => {
    const siblings = children.get(scope) ?? [];
    if (siblings.length === 0) return { w: 0, h: 0, place: () => {} };

    const layers = layerSiblings(scope, siblings);
    const columns: { items: PlanItem[]; blocks: Block[] }[] = [];
    for (const sibling of siblings) {
      const index = layers.get(sibling.id) ?? 0;
      while (columns.length <= index) columns.push({ items: [], blocks: [] });
      columns[index].items.push(sibling);
      columns[index].blocks.push(layoutItem(sibling));
    }

    const placed: { block: Block; x: number; y: number }[] = [];
    let x = 0;
    let totalH = 0;
    for (const column of columns) {
      if (column.blocks.length === 0) continue;
      let y = 0;
      let columnW = 0;
      for (const block of column.blocks) {
        placed.push({ block, x, y });
        y += block.h + GAP_Y;
        columnW = Math.max(columnW, block.w);
      }
      totalH = Math.max(totalH, y - GAP_Y);
      x += columnW + GAP_X;
    }
    const totalW = x - GAP_X;

    return {
      w: totalW,
      h: totalH,
      place: (originX, originY) => {
        for (const { block, x: dx, y: dy } of placed) block.place(originX + dx, originY + dy);
      },
    };
  };

  /** Block for one item: its node plus (inside/below) its child scope. */
  const layoutItem = (item: PlanItem): Block => {
    const kids = children.get(item.id) ?? [];
    const inner = kids.length > 0 ? layoutScope(item.id) : null;

    if (item.type === "category") {
      const innerW = Math.max(inner?.w ?? 0, CAT_MIN_INNER_W);
      const innerH = inner?.h ?? CAT_EMPTY_INNER_H;
      const w = innerW + CAT_PAD_X * 2;
      const h = CAT_HEADER_H + CAT_PAD_TOP + innerH + CAT_PAD_BOTTOM;
      return {
        w,
        h,
        place: (x, y) => {
          rects.set(item.id, { x, y, w, h });
          inner?.place(x + CAT_PAD_X, y + CAT_HEADER_H + CAT_PAD_TOP);
        },
      };
    }

    const h = nodeHeight(item);
    const blockW = inner ? Math.max(NODE_W, INDENT + inner.w) : NODE_W;
    const blockH = inner ? h + CHILD_GAP + inner.h : h;
    return {
      w: blockW,
      h: blockH,
      place: (x, y) => {
        rects.set(item.id, { x, y, w: NODE_W, h });
        inner?.place(x + INDENT, y + h + CHILD_GAP);
      },
    };
  };

  layoutScope(null).place(0, 0);

  const containerOf = new Map<ID, ID | null>();
  for (const item of items) {
    let container: ID | null = null;
    for (const ancestor of chainOf(item.id).slice(1)) {
      if (byId.get(ancestor)?.type === "category") {
        container = ancestor;
        break;
      }
    }
    containerOf.set(item.id, container);
  }

  return { rects, containerOf };
}
