import type { Dependency, ID, PlanItem } from "./types";
import { childrenMap, itemMap } from "./logic";

/**
 * Deterministic auto-layout. Recomputed from scratch on every change so the
 * canvas always resolves to a clean overview. Hierarchy and dependency flow
 * are separate axes:
 *
 *  - Hierarchy is vertical containment: every item with children (a group or
 *    a parent task) becomes a box; its children live underneath the header,
 *    indented, inside the box.
 *  - Flow is horizontal: siblings are arranged into dependency layers
 *    (longest-path) — anything a sibling waits on sits in a column to its
 *    left. Dependencies between *descendants* of two siblings order those
 *    siblings the same way.
 */

export const NODE_W = 240;
export const GROUP_HEADER_H = 44;
export const TASK_HEADER_H = 40;

const GROUP_PAD_X = 16;
const GROUP_PAD_TOP = 12;
const GROUP_PAD_BOTTOM = 16;
const TASK_PAD_LEFT = 22; // children of a parent task read as indented
const TASK_PAD_RIGHT = 12;
const TASK_PAD_TOP = 8;
const TASK_PAD_BOTTOM = 12;
const MIN_INNER_W = NODE_W;
const EMPTY_GROUP_INNER_H = 56;
const GAP_X = 64; // between dependency layers
const GAP_Y = 16; // between stacked sibling blocks

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  /** Absolute canvas rect per item. For parents this is the whole box. */
  rects: Map<ID, Rect>;
}

export function leafHeight(item: PlanItem): number {
  return item.description.trim().length > 0 ? 68 : 46;
}

export function headerHeight(item: PlanItem): number {
  if (item.type === "group") return GROUP_HEADER_H;
  return item.description.trim().length > 0 ? TASK_HEADER_H + 18 : TASK_HEADER_H;
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
    // cycles even when the real dependency graph is deadlock-free (subtasks
    // of two parents feeding each other), so plain topological sort won't do.
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
    const columns: Block[][] = [];
    for (const sibling of siblings) {
      const index = layers.get(sibling.id) ?? 0;
      while (columns.length <= index) columns.push([]);
      columns[index].push(layoutItem(sibling));
    }

    const placed: { block: Block; x: number; y: number }[] = [];
    let x = 0;
    let totalH = 0;
    for (const column of columns) {
      if (column.length === 0) continue;
      let y = 0;
      let columnW = 0;
      for (const block of column) {
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

  /** Block for one item: a leaf card, or a box wrapping header + children. */
  const layoutItem = (item: PlanItem): Block => {
    const kids = children.get(item.id) ?? [];

    if (kids.length === 0 && item.type !== "group") {
      const h = leafHeight(item);
      return {
        w: NODE_W,
        h,
        place: (x, y) => rects.set(item.id, { x, y, w: NODE_W, h }),
      };
    }

    const inner = layoutScope(item.id);
    const headerH = headerHeight(item);
    const padL = item.type === "group" ? GROUP_PAD_X : TASK_PAD_LEFT;
    const padR = item.type === "group" ? GROUP_PAD_X : TASK_PAD_RIGHT;
    const padT = item.type === "group" ? GROUP_PAD_TOP : TASK_PAD_TOP;
    const padB = item.type === "group" ? GROUP_PAD_BOTTOM : TASK_PAD_BOTTOM;
    const innerW = Math.max(inner.w, MIN_INNER_W);
    const innerH = kids.length > 0 ? inner.h : EMPTY_GROUP_INNER_H;
    const w = innerW + padL + padR;
    const h = headerH + padT + innerH + padB;
    return {
      w,
      h,
      place: (x, y) => {
        rects.set(item.id, { x, y, w, h });
        inner.place(x + padL, y + headerH + padT);
      },
    };
  };

  layoutScope(null).place(0, 0);
  return { rects };
}

export interface InsertTarget {
  parentId: ID | null;
  /** Sibling order for the new item (fractional to slot between neighbours). */
  order: number;
  /** True when the point falls between two existing siblings. */
  between: boolean;
}

/**
 * Resolve a canvas point (flow coordinates) to "where would a new item go":
 * the deepest parent box containing the point becomes the scope, and the
 * vertical position picks the slot between its children. Powers
 * right-click-to-add.
 */
export function insertTargetAt(
  items: PlanItem[],
  layout: LayoutResult,
  point: { x: number; y: number },
): InsertTarget {
  const byId = itemMap(items);
  const children = childrenMap(items);
  const MARGIN = 8;

  const contains = (box: Rect, margin: number) =>
    point.x >= box.x - margin &&
    point.x <= box.x + box.w + margin &&
    point.y >= box.y - margin &&
    point.y <= box.y + box.h + margin;

  const depthOf = (id: ID): number => {
    let depth = 0;
    let current = byId.get(id);
    const guard = new Set<ID>();
    while (current?.parentId && !guard.has(current.id)) {
      guard.add(current.id);
      depth++;
      current = byId.get(current.parentId);
    }
    return depth;
  };

  // Hierarchy is containment, so parent boxes ARE the subtree area: pick the
  // deepest box (group or parent task) holding the point.
  let scope: ID | null = null;
  let bestDepth = -1;
  for (const item of items) {
    const isContainer = item.type === "group" || (children.get(item.id) ?? []).length > 0;
    if (!isContainer) continue;
    const rect = layout.rects.get(item.id);
    if (!rect || !contains(rect, 0)) continue;
    const depth = depthOf(item.id);
    if (depth > bestDepth) {
      bestDepth = depth;
      scope = item.id;
    }
  }

  // Slot between siblings by vertical position, preferring the column under
  // the pointer (dependency layers spread siblings across columns).
  const siblings = (children.get(scope) ?? []).slice().sort((a, b) => a.order - b.order);
  const inColumn = siblings.filter((s) => {
    const rect = layout.rects.get(s.id);
    return rect && point.x >= rect.x - MARGIN && point.x <= rect.x + rect.w + MARGIN;
  });
  const pool = inColumn.length > 0 ? inColumn : siblings;
  let prev: PlanItem | null = null;
  for (const sibling of pool) {
    const rect = layout.rects.get(sibling.id);
    if (rect && rect.y + rect.h / 2 <= point.y && (!prev || sibling.order > prev.order)) {
      prev = sibling;
    }
  }
  const next = prev ? (siblings.find((s) => s.order > prev.order) ?? null) : (siblings[0] ?? null);

  const order =
    prev && next
      ? (prev.order + next.order) / 2
      : prev
        ? prev.order + 1
        : next
          ? next.order - 1
          : 0;
  return { parentId: scope, order, between: !!(prev && next) };
}
