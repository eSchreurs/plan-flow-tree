import type { Dependency, ID, ItemType, PlanItem, Project } from "./types";
import { TYPE_LABEL } from "./types";

export function itemMap(items: PlanItem[]): Map<ID, PlanItem> {
  return new Map(items.map((i) => [i.id, i]));
}

/** Children grouped by parent id (null = root), sorted by sibling order. */
export function childrenMap(items: PlanItem[]): Map<ID | null, PlanItem[]> {
  const map = new Map<ID | null, PlanItem[]>();
  for (const item of items) {
    const list = map.get(item.parentId) ?? [];
    list.push(item);
    map.set(item.parentId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.order - b.order);
  return map;
}

/** Groups hold tasks; tasks hold tasks. Groups never nest. */
export function canParent(parent: ItemType, child: ItemType): boolean {
  return child === "task" && (parent === "group" || parent === "task");
}

/** Item types that may be created under the given parent (null = root). */
export function allowedChildTypes(parent: ItemType | null): ItemType[] {
  if (parent === null) return ["group", "task"];
  return ["task"];
}

/**
 * Recompute parent completion bottom-up: an item with children is done
 * exactly when all of its children are done. Leaves keep their manual state.
 * Mutates and returns `items`.
 */
export function rollUpDone(items: PlanItem[]): PlanItem[] {
  const children = childrenMap(items);
  const visit = (item: PlanItem): boolean => {
    const kids = children.get(item.id) ?? [];
    if (kids.length > 0) {
      // No `every` here: every child must be visited so its own derived
      // state refreshes, even after one already came back unfinished.
      let allDone = true;
      for (const kid of kids) allDone = visit(kid) && allDone;
      item.done = allDone;
    }
    return item.done;
  };
  for (const root of children.get(null) ?? []) visit(root);
  return items;
}

export interface BlockInfo {
  /** Unmet prerequisites from this item's own incoming dependencies. */
  unmet: ID[];
  /** Blocked directly or via any ancestor. */
  blocked: boolean;
}

/**
 * An item is blocked while any of its dependencies is unfinished, or while
 * any of its ancestors is blocked (a subtask of a blocked task cannot be
 * worked on either).
 */
export function computeBlocked(items: PlanItem[], deps: Dependency[]): Map<ID, BlockInfo> {
  const byId = itemMap(items);
  const incoming = new Map<ID, ID[]>();
  for (const dep of deps) {
    const list = incoming.get(dep.target) ?? [];
    list.push(dep.source);
    incoming.set(dep.target, list);
  }

  const result = new Map<ID, BlockInfo>();
  const visit = (id: ID, stack: Set<ID>): BlockInfo => {
    const cached = result.get(id);
    if (cached) return cached;
    // Guard against malformed parent cycles so we never recurse forever.
    if (stack.has(id)) return { unmet: [], blocked: false };
    stack.add(id);

    const item = byId.get(id)!;
    const unmet = (incoming.get(id) ?? []).filter((src) => !(byId.get(src)?.done ?? true));
    const parentBlocked = item.parentId ? visit(item.parentId, stack).blocked : false;
    const info: BlockInfo = { unmet, blocked: unmet.length > 0 || parentBlocked };
    result.set(id, info);
    stack.delete(id);
    return info;
  };
  for (const item of items) visit(item.id, new Set());
  return result;
}

/**
 * Every unfinished prerequisite that keeps `id` from being worked on,
 * including those inherited from ancestors. For inspector display.
 */
export function blockingSources(items: PlanItem[], deps: Dependency[], id: ID): PlanItem[] {
  const byId = itemMap(items);
  const blockInfo = computeBlocked(items, deps);
  const sources: PlanItem[] = [];
  const seen = new Set<ID>();
  let current: PlanItem | undefined = byId.get(id);
  while (current) {
    for (const src of blockInfo.get(current.id)?.unmet ?? []) {
      if (!seen.has(src)) {
        seen.add(src);
        const item = byId.get(src);
        if (item) sources.push(item);
      }
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return sources;
}

/**
 * Cycle check over the combined "must finish before" graph:
 *   - dependency s → t: s must finish before t
 *   - hierarchy child → parent: a parent is done only when all children are
 */
function reaches(
  items: PlanItem[],
  deps: Dependency[],
  from: ID,
  to: ID,
  reparent?: { itemId: ID; parentId: ID | null },
): boolean {
  const adjacency = new Map<ID, ID[]>();
  const addEdge = (a: ID, b: ID) => {
    const list = adjacency.get(a) ?? [];
    list.push(b);
    adjacency.set(a, list);
  };
  for (const dep of deps) addEdge(dep.source, dep.target);
  for (const item of items) {
    const parentId = reparent && item.id === reparent.itemId ? reparent.parentId : item.parentId;
    if (parentId) addEdge(item.id, parentId);
  }
  const stack = [from];
  const seen = new Set<ID>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) stack.push(next);
  }
  return false;
}

/**
 * Validate adding the dependency `source → target`. Returns an error message
 * or null when the edge is fine. Adding s → t is rejected if t can already
 * reach s in the combined graph — e.g. a dependency from an item onto its own
 * descendant, or any cycle of dependencies threaded through the hierarchy.
 */
export function validateDep(
  items: PlanItem[],
  deps: Dependency[],
  source: ID,
  target: ID,
): string | null {
  if (source === target) return "An item cannot depend on itself.";
  const byId = itemMap(items);
  if (!byId.has(source) || !byId.has(target)) return "Unknown item.";
  if (deps.some((d) => d.source === source && d.target === target))
    return "That dependency already exists.";
  if (reaches(items, deps, target, source)) {
    const s = byId.get(source)!;
    const t = byId.get(target)!;
    return `“${t.title}” already needs to finish before “${s.title}” — that would deadlock.`;
  }
  return null;
}

/**
 * Validate moving `itemId` under `newParentId` (null = root). Returns an
 * error message or null when the move is fine.
 */
export function validateMove(
  items: PlanItem[],
  deps: Dependency[],
  itemId: ID,
  newParentId: ID | null,
): string | null {
  const byId = itemMap(items);
  const item = byId.get(itemId);
  if (!item) return "Unknown item.";
  if (item.parentId === newParentId) return null;
  if (item.type === "group") {
    return newParentId === null ? null : "Groups always stay top-level.";
  }
  if (newParentId !== null) {
    const parent = byId.get(newParentId);
    if (!parent) return "Unknown target.";
    if (!canParent(parent.type, item.type))
      return `A ${TYPE_LABEL[item.type].toLowerCase()} cannot go inside a ${TYPE_LABEL[parent.type].toLowerCase()}.`;
    if (subtreeIds(items, itemId).has(newParentId)) return "An item cannot be moved into itself.";
    // The new child→parent edge is parentId → up; a deadlock appears when the
    // new parent chain already has to finish before the item does.
    if (reaches(items, deps, newParentId, itemId, { itemId, parentId: null }))
      return "That move would deadlock with existing dependencies.";
  }
  return null;
}

export interface Progress {
  done: number;
  total: number;
}

/** Per-item leaf progress (done leaves / total leaves in the subtree). */
export function computeProgress(items: PlanItem[]): Map<ID, Progress> {
  const children = childrenMap(items);
  const result = new Map<ID, Progress>();
  const visit = (item: PlanItem): Progress => {
    const kids = children.get(item.id) ?? [];
    if (kids.length === 0) {
      const p = { done: item.done ? 1 : 0, total: 1 };
      result.set(item.id, p);
      return p;
    }
    const p: Progress = { done: 0, total: 0 };
    for (const kid of kids) {
      const kp = visit(kid);
      p.done += kp.done;
      p.total += kp.total;
    }
    result.set(item.id, p);
    return p;
  };
  for (const root of children.get(null) ?? []) visit(root);
  return result;
}

export function projectProgress(project: Project): Progress {
  const perItem = computeProgress(project.items);
  const children = childrenMap(project.items);
  const total: Progress = { done: 0, total: 0 };
  for (const root of children.get(null) ?? []) {
    const p = perItem.get(root.id);
    if (p) {
      total.done += p.done;
      total.total += p.total;
    }
  }
  return total;
}

/** The item ids of `id` plus all of its descendants. */
export function subtreeIds(items: PlanItem[], id: ID): Set<ID> {
  const children = childrenMap(items);
  const ids = new Set<ID>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (ids.has(current)) continue;
    ids.add(current);
    for (const kid of children.get(current) ?? []) stack.push(kid.id);
  }
  return ids;
}

/**
 * Items that stay highlighted for the given search text + tag filter, or
 * null when no filter is active. A match lights up its ancestors (context)
 * and its whole subtree (children belong to their parent).
 */
export function filterVisible(items: PlanItem[], query: string, tagIds: Set<ID>): Set<ID> | null {
  const q = query.trim().toLowerCase();
  if (!q && tagIds.size === 0) return null;

  const byId = itemMap(items);
  const matches = items.filter((item) => {
    const textOk = !q || `${item.title}\n${item.description}`.toLowerCase().includes(q);
    const tagOk = tagIds.size === 0 || item.tagIds.some((t) => tagIds.has(t));
    return textOk && tagOk;
  });

  const visible = new Set<ID>();
  for (const match of matches) {
    for (const id of subtreeIds(items, match.id)) visible.add(id);
    let current = match.parentId ? byId.get(match.parentId) : undefined;
    const guard = new Set<ID>();
    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      visible.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return visible;
}

export function describeDep(items: PlanItem[], dep: Dependency): string {
  const byId = itemMap(items);
  const s = byId.get(dep.source);
  const t = byId.get(dep.target);
  return `“${s?.title ?? "?"}” must finish before “${t?.title ?? "?"}”`;
}
