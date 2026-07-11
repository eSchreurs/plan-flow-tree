import type { ID, PlanItem } from "./types";
import type { Rect } from "./layout";
import { childrenMap } from "./logic";

/**
 * Two-sided mind-map layout: the project sits in the middle, root items fan
 * out left and right (balanced by subtree size), children extend outward
 * level by level. A classic tidy tree per side: leaves stack vertically,
 * every parent centers on its children.
 */

export const MIND_NODE_W = 168;
export const MIND_NODE_H = 34;
export const MIND_CENTER_W = 200;
export const MIND_CENTER_H = 56;
const LEVEL_X = 216;
const V_GAP = 10;
const BRANCH_GAP = 22;

export interface MindLayout {
  rects: Map<ID, Rect>;
  /** +1 = right of center, -1 = left. */
  side: Map<ID, 1 | -1>;
  /** Root item id → color source for the whole branch. */
  branchRoot: Map<ID, ID>;
  centerRect: Rect;
}

export function layoutMindMap(items: PlanItem[]): MindLayout {
  const children = childrenMap(items);
  const rects = new Map<ID, Rect>();
  const side = new Map<ID, 1 | -1>();
  const branchRoot = new Map<ID, ID>();
  const centerRect: Rect = {
    x: -MIND_CENTER_W / 2,
    y: -MIND_CENTER_H / 2,
    w: MIND_CENTER_W,
    h: MIND_CENTER_H,
  };

  const roots = children.get(null) ?? [];
  if (roots.length === 0) return { rects, side, branchRoot, centerRect };

  const sizeOf = (item: PlanItem): number => {
    const kids = children.get(item.id) ?? [];
    if (kids.length === 0) return 1;
    return kids.reduce((sum, kid) => sum + sizeOf(kid), 0);
  };

  // Balance branches over the two sides, preserving order within a side.
  const assignments: { item: PlanItem; dir: 1 | -1 }[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  for (const root of roots) {
    const weight = sizeOf(root);
    if (rightWeight <= leftWeight) {
      assignments.push({ item: root, dir: 1 });
      rightWeight += weight;
    } else {
      assignments.push({ item: root, dir: -1 });
      leftWeight += weight;
    }
  }

  /** Height of the subtree block (node + stacked children). */
  const heightOf = (item: PlanItem): number => {
    const kids = children.get(item.id) ?? [];
    if (kids.length === 0) return MIND_NODE_H;
    const kidsHeight = kids.reduce((sum, kid) => sum + heightOf(kid), 0);
    return Math.max(MIND_NODE_H, kidsHeight + (kids.length - 1) * V_GAP);
  };

  /** Place `item` with its block's top at `top`; returns the node's centerY. */
  const place = (item: PlanItem, depth: number, top: number, dir: 1 | -1, root: ID): number => {
    side.set(item.id, dir);
    branchRoot.set(item.id, root);
    const kids = children.get(item.id) ?? [];
    const gap = MIND_CENTER_W / 2 + 48;
    const distance = gap + (depth - 1) * LEVEL_X;
    const x = dir === 1 ? distance : -distance - MIND_NODE_W;

    let centerY: number;
    if (kids.length === 0) {
      centerY = top + MIND_NODE_H / 2;
    } else {
      let cursor = top;
      let first = Number.POSITIVE_INFINITY;
      let last = Number.NEGATIVE_INFINITY;
      for (const kid of kids) {
        const kidCenter = place(kid, depth + 1, cursor, dir, root);
        first = Math.min(first, kidCenter);
        last = Math.max(last, kidCenter);
        cursor += heightOf(kid) + V_GAP;
      }
      centerY = (first + last) / 2;
    }
    rects.set(item.id, { x, y: centerY - MIND_NODE_H / 2, w: MIND_NODE_W, h: MIND_NODE_H });
    return centerY;
  };

  for (const dir of [1, -1] as const) {
    const branches = assignments.filter((a) => a.dir === dir).map((a) => a.item);
    if (branches.length === 0) continue;
    const total =
      branches.reduce((sum, b) => sum + heightOf(b), 0) + (branches.length - 1) * BRANCH_GAP;
    let cursor = -total / 2;
    for (const branch of branches) {
      place(branch, 1, cursor, dir, branch.id);
      cursor += heightOf(branch) + BRANCH_GAP;
    }
  }

  return { rects, side, branchRoot, centerRect };
}
