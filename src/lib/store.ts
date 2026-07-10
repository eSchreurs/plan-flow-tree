import { useSyncExternalStore } from "react";
import type { AppState, ColorKey, ID, ItemType, PlanItem, Project } from "./types";
import { COLOR_KEYS, TYPE_LABEL } from "./types";
import { computeBlocked, rollUpDone, subtreeIds, validateDep } from "./logic";
import { createDemoState } from "./seed";

const STORAGE_KEY = "planflow.v1";

function uid(): ID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.projects)) return parsed;
    }
  } catch {
    // fall through to demo data
  }
  return createDemoState(Date.now());
}

let state: AppState = load();
const listeners = new Set<() => void>();

function commit(next: AppState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full/unavailable — keep working in memory
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

function withProject(projectId: ID, mutate: (project: Project) => void) {
  commit({
    projects: state.projects.map((project) => {
      if (project.id !== projectId) return project;
      const draft: Project = structuredClone(project);
      mutate(draft);
      rollUpDone(draft.items);
      draft.updatedAt = Date.now();
      return draft;
    }),
  });
}

// ---------- projects ----------

export function createProject(name: string): ID {
  const id = uid();
  const now = Date.now();
  commit({
    projects: [
      ...state.projects,
      { id, name, items: [], deps: [], createdAt: now, updatedAt: now },
    ],
  });
  return id;
}

export function renameProject(projectId: ID, name: string) {
  withProject(projectId, (project) => {
    project.name = name;
  });
}

export function deleteProject(projectId: ID) {
  commit({ projects: state.projects.filter((p) => p.id !== projectId) });
}

export function duplicateProject(projectId: ID): ID | null {
  const source = state.projects.find((p) => p.id === projectId);
  if (!source) return null;
  const copy: Project = structuredClone(source);
  const id = uid();
  const idMap = new Map<ID, ID>();
  for (const item of copy.items) idMap.set(item.id, `${id}-${item.id}`);
  copy.id = id;
  copy.name = `${source.name} (copy)`;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  copy.items = copy.items.map((item) => ({
    ...item,
    id: idMap.get(item.id)!,
    parentId: item.parentId ? (idMap.get(item.parentId) ?? null) : null,
  }));
  copy.deps = copy.deps.map((dep, index) => ({
    id: `${id}-d${index}`,
    source: idMap.get(dep.source)!,
    target: idMap.get(dep.target)!,
  }));
  commit({ projects: [...state.projects, copy] });
  return id;
}

export function restoreDemoProjects() {
  const demo = createDemoState(Date.now());
  const existing = new Set(state.projects.map((p) => p.id));
  commit({
    projects: [...state.projects, ...demo.projects.filter((p) => !existing.has(p.id))],
  });
}

// ---------- items ----------

/** Rotating default colors so new containers are distinguishable at a glance. */
const CONTAINER_COLOR_ROTATION: ColorKey[] = [
  "blue",
  "violet",
  "green",
  "amber",
  "teal",
  "pink",
  "orange",
  "red",
];

function defaultColor(type: ItemType, items: PlanItem[]): ColorKey {
  if (type === "task") return "slate";
  const count = items.filter((i) => i.type === type).length;
  return CONTAINER_COLOR_ROTATION[count % CONTAINER_COLOR_ROTATION.length];
}

export function addItem(
  projectId: ID,
  type: ItemType,
  parentId: ID | null,
  opts?: { title?: string; order?: number },
): ID {
  const id = uid();
  withProject(projectId, (project) => {
    const siblings = project.items.filter((i) => i.parentId === parentId);
    project.items.push({
      id,
      type,
      parentId,
      title: opts?.title ?? `New ${TYPE_LABEL[type].toLowerCase()}`,
      description: "",
      color: defaultColor(type, project.items),
      done: false,
      // Fractional orders let an item slot in between two siblings without
      // renumbering the rest.
      order: opts?.order ?? Math.max(-1, ...siblings.map((s) => s.order)) + 1,
    });
  });
  return id;
}

/** Deep-copy an item (and its subtree + internal dependencies) right after itself. */
export function duplicateItem(projectId: ID, itemId: ID): ID | null {
  const project = state.projects.find((p) => p.id === projectId);
  const original = project?.items.find((i) => i.id === itemId);
  if (!project || !original) return null;

  const ids = subtreeIds(project.items, itemId);
  const idMap = new Map<ID, ID>();
  for (const oldId of ids) idMap.set(oldId, uid());

  const siblings = project.items
    .filter((i) => i.parentId === original.parentId)
    .sort((a, b) => a.order - b.order);
  const next = siblings.find((s) => s.order > original.order);
  const order = next ? (original.order + next.order) / 2 : original.order + 1;

  withProject(projectId, (draft) => {
    const copies = draft.items
      .filter((i) => ids.has(i.id))
      .map((i) => ({
        ...i,
        id: idMap.get(i.id)!,
        parentId: i.id === itemId ? i.parentId : (idMap.get(i.parentId!) ?? i.parentId),
        order: i.id === itemId ? order : i.order,
      }));
    draft.items.push(...copies);
    for (const dep of draft.deps.filter((d) => ids.has(d.source) && ids.has(d.target))) {
      draft.deps.push({
        id: uid(),
        source: idMap.get(dep.source)!,
        target: idMap.get(dep.target)!,
      });
    }
  });
  return idMap.get(itemId) ?? null;
}

export function updateItem(
  projectId: ID,
  itemId: ID,
  patch: Partial<Pick<PlanItem, "title" | "description" | "color">>,
) {
  withProject(projectId, (project) => {
    const item = project.items.find((i) => i.id === itemId);
    if (item) Object.assign(item, patch);
  });
}

/**
 * Toggle a leaf's completion. Containers derive their state from children and
 * blocked items cannot be completed (they can still be un-completed).
 */
export function toggleDone(projectId: ID, itemId: ID) {
  withProject(projectId, (project) => {
    const item = project.items.find((i) => i.id === itemId);
    if (!item) return;
    const hasChildren = project.items.some((i) => i.parentId === itemId);
    if (hasChildren) return;
    if (!item.done) {
      const blocked = computeBlocked(project.items, project.deps).get(itemId);
      if (blocked?.blocked) return;
    }
    item.done = !item.done;
  });
}

export function deleteItem(projectId: ID, itemId: ID) {
  withProject(projectId, (project) => {
    const doomed = subtreeIds(project.items, itemId);
    project.items = project.items.filter((i) => !doomed.has(i.id));
    project.deps = project.deps.filter((d) => !doomed.has(d.source) && !doomed.has(d.target));
  });
}

// ---------- dependencies ----------

export function addDep(projectId: ID, source: ID, target: ID): string | null {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return "Unknown project.";
  const error = validateDep(project.items, project.deps, source, target);
  if (error) return error;
  withProject(projectId, (draft) => {
    draft.deps.push({ id: uid(), source, target });
  });
  return null;
}

export function deleteDep(projectId: ID, depId: ID) {
  withProject(projectId, (project) => {
    project.deps = project.deps.filter((d) => d.id !== depId);
  });
}
