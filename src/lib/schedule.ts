import type { Dependency, ID, PlanItem } from "./types";
import { childrenMap, itemMap, subtreeIds } from "./logic";

/**
 * Forward scheduling for the timeline. Everything is measured in whole days
 * (days since the Unix epoch, UTC — so "2025-05-12" is the same day
 * everywhere). Rules, in priority order:
 *
 *  1. Explicit dates always win, even when they contradict dependencies.
 *  2. A parent without explicit dates spans its children.
 *  3. A dateless leaf starts at the latest end of its prerequisites (its own
 *     dependencies plus those inherited from ancestors), or today, and runs
 *     for a default couple of days.
 */

export const DAY_MS = 86_400_000;
export const DEFAULT_LEAF_DAYS = 2;

export function parseDay(iso: string): number | null {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.floor(t / DAY_MS);
}

export function dayToIso(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today as an epoch-day in the user's local calendar. */
export function todayDay(now = Date.now()): number {
  const d = new Date(now);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday (epoch day 0 was a Thursday). */
export function weekdayOf(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

export function formatDay(day: number): string {
  return new Date(day * DAY_MS).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export interface ScheduleEntry {
  /** Inclusive start day. */
  start: number;
  /** Exclusive end day (always > start). */
  end: number;
  explicitStart: boolean;
  explicitEnd: boolean;
}

export interface ProjectSchedule {
  entries: Map<ID, ScheduleEntry>;
  /** Day range covering every bar (min inclusive, max exclusive). */
  min: number;
  max: number;
  today: number;
}

export function scheduleProject(
  items: PlanItem[],
  deps: Dependency[],
  now = Date.now(),
): ProjectSchedule {
  const byId = itemMap(items);
  const children = childrenMap(items);
  const today = todayDay(now);

  const incoming = new Map<ID, ID[]>();
  for (const dep of deps) {
    incoming.set(dep.target, [...(incoming.get(dep.target) ?? []), dep.source]);
  }

  const entries = new Map<ID, ScheduleEntry>();
  const floors = new Map<ID, number>();
  // Separate guards: while a parent is mid-resolve its children still need
  // floorOf(parent) to work — only true recursion into the SAME computation
  // may bail.
  const resolvingFloor = new Set<ID>();
  const resolvingEntry = new Set<ID>();
  const subtreeCache = new Map<ID, Set<ID>>();
  const subtreeOf = (id: ID): Set<ID> => {
    let set = subtreeCache.get(id);
    if (!set) {
      set = subtreeIds(items, id);
      subtreeCache.set(id, set);
    }
    return set;
  };

  /**
   * Earliest allowed start from dependencies: the latest end among the
   * item's prerequisites and its ancestors' prerequisites. Dependencies
   * coming from the item's own descendants are ignored (they are redundant
   * with the hierarchy and would make this recursion circular).
   */
  const floorOf = (id: ID): number => {
    const cached = floors.get(id);
    if (cached !== undefined) return cached;
    const item = byId.get(id);
    if (!item || resolvingFloor.has(id)) return today;
    resolvingFloor.add(id);

    let floor = today;
    if (item.parentId && byId.has(item.parentId)) {
      const parent = byId.get(item.parentId)!;
      floor = Math.max(floor, floorOf(parent.id));
      const parentStart = parent.startDate ? parseDay(parent.startDate) : null;
      if (parentStart !== null) floor = Math.max(floor, parentStart);
    }
    const mine = subtreeOf(id);
    for (const src of incoming.get(id) ?? []) {
      if (mine.has(src) || !byId.has(src)) continue;
      floor = Math.max(floor, resolve(src).end);
    }
    resolvingFloor.delete(id);
    floors.set(id, floor);
    return floor;
  };

  const resolve = (id: ID): ScheduleEntry => {
    const cached = entries.get(id);
    if (cached) return cached;
    const item = byId.get(id);
    if (!item || resolvingEntry.has(id)) {
      return { start: today, end: today + 1, explicitStart: false, explicitEnd: false };
    }
    resolvingEntry.add(id);

    const explicitStart = item.startDate ? parseDay(item.startDate) : null;
    const explicitEnd = item.endDate ? parseDay(item.endDate) : null;
    const kids = children.get(id) ?? [];

    let start: number;
    let end: number;
    if (kids.length > 0) {
      let childMin = Number.POSITIVE_INFINITY;
      let childMax = Number.NEGATIVE_INFINITY;
      for (const kid of kids) {
        const entry = resolve(kid.id);
        childMin = Math.min(childMin, entry.start);
        childMax = Math.max(childMax, entry.end);
      }
      start = explicitStart ?? childMin;
      end = explicitEnd ?? childMax;
    } else {
      start = explicitStart ?? floorOf(id);
      end = explicitEnd ?? start + DEFAULT_LEAF_DAYS;
    }
    // endDate is inclusive in the UI ("ends on the 14th"), exclusive here.
    if (explicitEnd !== null) end = end + 1;
    if (end <= start) end = start + 1;

    const entry: ScheduleEntry = {
      start,
      end,
      explicitStart: explicitStart !== null,
      explicitEnd: explicitEnd !== null,
    };
    resolvingEntry.delete(id);
    entries.set(id, entry);
    return entry;
  };

  for (const item of items) resolve(item.id);

  let min = today;
  let max = today + 1;
  for (const entry of entries.values()) {
    min = Math.min(min, entry.start);
    max = Math.max(max, entry.end);
  }
  return { entries, min, max, today };
}
