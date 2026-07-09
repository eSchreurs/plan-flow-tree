import { useCallback, useEffect, useRef, useState } from "react";
import type { DependencyEdge, ID, Phase, PlannerState, TaskNode } from "./planner-types";
import { createSeed } from "./planner-seed";

const STORAGE_KEY = "planner-state-v1";

function load(): PlannerState {
  if (typeof window === "undefined") return createSeed();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PlannerState;
  } catch {}
  return createSeed();
}

export function usePlannerStore() {
  const [state, setState] = useState<PlannerState>(() =>
    typeof window === "undefined" ? createSeed() : load(),
  );
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      // ensure client re-reads localStorage on mount
      const loaded = load();
      setState(loaded);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const patch = useCallback((fn: (s: PlannerState) => PlannerState) => {
    setState((s) => normalize(fn(structuredClone(s))));
  }, []);

  return { state, setState: patch, reset: () => setState(createSeed()) };
}

// Recompute done propagation from leaves upward
function normalize(s: PlannerState): PlannerState {
  const byParent = new Map<ID | null, TaskNode[]>();
  s.tasks.forEach((t) => {
    const arr = byParent.get(t.parentId) ?? [];
    arr.push(t);
    byParent.set(t.parentId, arr);
  });

  const computeTask = (t: TaskNode): boolean => {
    const kids = byParent.get(t.id) ?? [];
    if (kids.length === 0) return t.done;
    const allDone = kids.every(computeTask);
    t.done = allDone;
    return allDone;
  };

  // roots per phase
  s.phases.forEach((p) => {
    const roots = s.tasks.filter((t) => t.phaseId === p.id && t.parentId === null);
    if (roots.length === 0) {
      // keep as-is
    } else {
      p.done = roots.every(computeTask);
    }
  });

  return s;
}

export function hasCycle(edges: DependencyEdge[], from: ID, to: ID): boolean {
  if (from === to) return true;
  // If there's already a path from `to` back to `from`, adding from->to creates a cycle
  const adj = new Map<ID, ID[]>();
  edges.forEach((e) => {
    const arr = adj.get(e.source) ?? [];
    arr.push(e.target);
    adj.set(e.source, arr);
  });
  const stack = [to];
  const seen = new Set<ID>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    (adj.get(n) ?? []).forEach((x) => stack.push(x));
  }
  return false;
}

export function getDoneMap(s: PlannerState): Map<ID, boolean> {
  const m = new Map<ID, boolean>();
  s.phases.forEach((p) => m.set(p.id, p.done));
  s.tasks.forEach((t) => m.set(t.id, t.done));
  return m;
}

export function getBlockedStatus(
  s: PlannerState,
): Map<ID, { blocked: boolean; ready: boolean }> {
  const done = getDoneMap(s);
  const incoming = new Map<ID, ID[]>();
  s.edges.forEach((e) => {
    const arr = incoming.get(e.target) ?? [];
    arr.push(e.source);
    incoming.set(e.target, arr);
  });
  const result = new Map<ID, { blocked: boolean; ready: boolean }>();
  const allIds = [...s.phases.map((p) => p.id), ...s.tasks.map((t) => t.id)];
  allIds.forEach((id) => {
    const deps = incoming.get(id) ?? [];
    const blocked = deps.some((d) => !done.get(d));
    const isDone = !!done.get(id);
    result.set(id, { blocked: blocked && !isDone, ready: !blocked && !isDone });
  });
  return result;
}

export type { Phase, TaskNode, DependencyEdge, PlannerState };
