import type { Dependency, ID, PlanItem } from "./types";
import { childrenMap, itemMap } from "./logic";

/**
 * Deterministic auto-layout. Recomputed from scratch on every change so the
 * canvas always resolves to a clean overview. Hierarchy and dependency flow
 * are separate axes:
 *
 *  - Hierarchy is vertical: groups and TOP-LEVEL parent tasks (direct
 *    children of a group or the root) are boxes wrapping their subtree.
 *    Deeper parent tasks stay plain cards — their children hang underneath,
 *    indented, connected by light tree branches, so task-in-task-in-task
 *    chains don't become boxes-in-boxes.
 *  - Flow is horizontal: siblings a dependency points at move into a column
 *    to the right of their prerequisites, and are vertically CENTERED on
 *    them (on the average of their centers when there are several).
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
const TREE_INDENT = 28; // indent for children of deep (non-box) parent tasks
const TREE_GAP = 18; // deep parent card bottom → children top

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  /** Absolute canvas rect per item. For boxes this is the whole container. */
  rects: Map<ID, Rect>;
  /** Nearest box ancestor per item — the React Flow parent node. */
  containerOf: Map<ID, ID | null>;
  /** Items that render as container boxes (groups + top-level parent tasks). */
  containers: Set<ID>;
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
  /** Vertical distance from block top to its visual anchor (card/box center). */
  anchorOffset: number;
  place: (x: number, y: number) => void;
}

export function layoutProject(items: PlanItem[], deps: Dependency[]): LayoutResult {
  const byId = itemMap(items);
  const children = childrenMap(items);
  const rects = new Map<ID, Rect>();

  /** Groups and top-level parent tasks render as boxes; deeper parents stay cards. */
  const isContainer = (item: PlanItem): boolean => {
    if (item.type === "group") return true;
    if ((children.get(item.id) ?? []).length === 0) return false;
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    return !parent || parent.type === "group";
  };

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

  /**
   * Dependency structure of one sibling group: longest-path layer per
   * sibling (cycle-tolerant) plus each sibling's in-scope prerequisites.
   */
  const analyzeSiblings = (scope: ID | null, siblings: PlanItem[]) => {
    const siblingIds = new Set(siblings.map((s) => s.id));
    const seen = new Set<string>();
    const adjacency = new Map<ID, ID[]>();
    const sourcesOf = new Map<ID, ID[]>();
    for (const dep of deps) {
      const from = liftTo(scope, dep.source);
      const to = liftTo(scope, dep.target);
      if (!from || !to || from === to) continue;
      if (!siblingIds.has(from) || !siblingIds.has(to)) continue;
      const key = `${from}→${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
      sourcesOf.set(to, [...(sourcesOf.get(to) ?? []), from]);
    }

    // Iterative relaxation, capped: projected sibling graphs can contain
    // cycles even when the real dependency graph is deadlock-free (subtasks
    // of two parents feeding each other), so plain topological sort won't do.
    const layers = new Map<ID, number>(siblings.map((s) => [s.id, 0]));
    const cap = siblings.length - 1;
    for (let pass = 0; pass < siblings.length; pass++) {
      let changed = false;
      for (const [from, targets] of adjacency) {
        for (const to of targets) {
          const proposed = Math.min(cap, (layers.get(from) ?? 0) + 1);
          if (proposed > (layers.get(to) ?? 0)) {
            layers.set(to, proposed);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return { layers, sourcesOf };
  };

  /**
   * Lay out all children of `scope`. Column 0 stacks in sibling order; each
   * later column places every block so its anchor lines up with the average
   * anchor of its prerequisites, then pushes blocks apart top-down to
   * resolve overlaps.
   */
  const layoutScope = (scope: ID | null): Block => {
    const siblings = children.get(scope) ?? [];
    if (siblings.length === 0) return { w: 0, h: 0, anchorOffset: 0, place: () => {} };

    const { layers, sourcesOf } = analyzeSiblings(scope, siblings);
    const blocks = new Map<ID, Block>(siblings.map((s) => [s.id, layoutItem(s)]));

    const columns: PlanItem[][] = [];
    for (const sibling of siblings) {
      const index = layers.get(sibling.id) ?? 0;
      (columns[index] ??= []).push(sibling);
    }

    const columnX: number[] = [];
    let x = 0;
    columns.forEach((column, index) => {
      columnX[index] = x;
      x += Math.max(...column.map((s) => blocks.get(s.id)!.w)) + GAP_X;
    });
    const totalW = x - GAP_X;

    const tops = new Map<ID, number>();
    const anchorOf = (id: ID) => tops.get(id)! + blocks.get(id)!.anchorOffset;
    columns.forEach((column, columnIndex) => {
      if (columnIndex === 0) {
        let y = 0;
        for (const sibling of column) {
          tops.set(sibling.id, y);
          y += blocks.get(sibling.id)!.h + GAP_Y;
        }
        return;
      }
      const order = new Map(column.map((s, i) => [s.id, i]));
      const desired = column.map((sibling) => {
        const sources = (sourcesOf.get(sibling.id) ?? []).filter(
          (src) => (layers.get(src) ?? 0) < columnIndex && tops.has(src),
        );
        if (sources.length === 0) return { sibling, y: null };
        const centerAvg = sources.reduce((sum, src) => sum + anchorOf(src), 0) / sources.length;
        return { sibling, y: centerAvg - blocks.get(sibling.id)!.anchorOffset };
      });
      desired.sort((a, b) => {
        const ay = a.y ?? Number.POSITIVE_INFINITY;
        const by = b.y ?? Number.POSITIVE_INFINITY;
        return ay - by || order.get(a.sibling.id)! - order.get(b.sibling.id)!;
      });
      let cursor = Number.NEGATIVE_INFINITY;
      for (const { sibling, y } of desired) {
        const target = y ?? (cursor === Number.NEGATIVE_INFINITY ? 0 : cursor);
        const top = Math.max(target, cursor);
        tops.set(sibling.id, top);
        cursor = top + blocks.get(sibling.id)!.h + GAP_Y;
      }
    });

    // Centering can push blocks above 0 — shift the whole scope back down.
    let minY = Number.POSITIVE_INFINITY;
    let maxBottom = Number.NEGATIVE_INFINITY;
    for (const sibling of siblings) {
      const top = tops.get(sibling.id)!;
      minY = Math.min(minY, top);
      maxBottom = Math.max(maxBottom, top + blocks.get(sibling.id)!.h);
    }
    const totalH = maxBottom - minY;

    return {
      w: totalW,
      h: totalH,
      anchorOffset: totalH / 2,
      place: (originX, originY) => {
        for (const sibling of siblings) {
          blocks
            .get(sibling.id)!
            .place(
              originX + columnX[layers.get(sibling.id) ?? 0],
              originY + tops.get(sibling.id)! - minY,
            );
        }
      },
    };
  };

  /** Block for one item: leaf card, box, or card-with-hanging-subtree. */
  const layoutItem = (item: PlanItem): Block => {
    const kids = children.get(item.id) ?? [];

    if (kids.length === 0 && item.type !== "group") {
      const h = leafHeight(item);
      return {
        w: NODE_W,
        h,
        anchorOffset: h / 2,
        place: (x, y) => rects.set(item.id, { x, y, w: NODE_W, h }),
      };
    }

    if (isContainer(item)) {
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
        anchorOffset: h / 2,
        place: (x, y) => {
          rects.set(item.id, { x, y, w, h });
          inner.place(x + padL, y + headerH + padT);
        },
      };
    }

    // Deep parent task: plain card with its children hanging underneath,
    // indented — tree branches are drawn by the canvas as edges.
    const inner = layoutScope(item.id);
    const nodeH = leafHeight(item);
    const w = Math.max(NODE_W, TREE_INDENT + inner.w);
    const h = nodeH + TREE_GAP + inner.h;
    return {
      w,
      h,
      anchorOffset: nodeH / 2,
      place: (x, y) => {
        rects.set(item.id, { x, y, w: NODE_W, h: nodeH });
        inner.place(x + TREE_INDENT, y + nodeH + TREE_GAP);
      },
    };
  };

  layoutScope(null).place(0, 0);

  const containers = new Set<ID>();
  for (const item of items) if (isContainer(item)) containers.add(item.id);
  const containerOf = new Map<ID, ID | null>();
  for (const item of items) {
    let container: ID | null = null;
    for (const ancestor of chainOf(item.id).slice(1)) {
      if (containers.has(ancestor)) {
        container = ancestor;
        break;
      }
    }
    containerOf.set(item.id, container);
  }

  return { rects, containerOf, containers };
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
 * the deepest parent whose area contains the point becomes the scope (box
 * rect for containers, subtree bounding box for deep parent tasks), and the
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

  /** Box rect for containers; union of the subtree's rects for deep parents. */
  const areaOf = (id: ID): Rect | null => {
    if (layout.containers.has(id)) return layout.rects.get(id) ?? null;
    let area = layout.rects.get(id) ?? null;
    if (!area) return null;
    const stack = [...(children.get(id) ?? [])];
    while (stack.length > 0) {
      const kid = stack.pop()!;
      const rect = layout.rects.get(kid.id);
      if (rect) {
        const x = Math.min(area.x, rect.x);
        const y = Math.min(area.y, rect.y);
        area = {
          x,
          y,
          w: Math.max(area.x + area.w, rect.x + rect.w) - x,
          h: Math.max(area.y + area.h, rect.y + rect.h) - y,
        };
      }
      stack.push(...(children.get(kid.id) ?? []));
    }
    return area;
  };

  let scope: ID | null = null;
  let bestDepth = -1;
  for (const item of items) {
    if ((children.get(item.id) ?? []).length === 0 && !layout.containers.has(item.id)) continue;
    const area = areaOf(item.id);
    if (!area || !contains(area, 0)) continue;
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
