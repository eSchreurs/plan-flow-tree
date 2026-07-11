export type ID = string;

export const ITEM_TYPES = ["group", "task"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const TYPE_LABEL: Record<ItemType, string> = {
  group: "Group",
  task: "Task",
};

export const COLOR_KEYS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** Colored label used purely for filtering and search — never a container. */
export interface Tag {
  id: ID;
  name: string;
  color: ColorKey;
}

/**
 * The whole model is Group ⊃ Task*: groups are top-level containers, and any
 * task can hold unlimited child tasks (a task with children acts as a
 * parent/header). Tasks may also live directly at the root.
 */
export interface PlanItem {
  id: ID;
  type: ItemType;
  /** Groups are always root (null). Tasks: group id, task id, or null (root). */
  parentId: ID | null;
  title: string;
  description: string;
  color: ColorKey;
  /**
   * Completion. Manually toggled on leaves (items without children);
   * recomputed from children for parents on every mutation.
   */
  done: boolean;
  /** Sibling sort order (fractional values slot between neighbours). */
  order: number;
  /** Tags for filtering/search. */
  tagIds: ID[];
}

export interface Dependency {
  id: ID;
  /** The prerequisite item. */
  source: ID;
  /** The dependent item — cannot be done until `source` is done. */
  target: ID;
}

export interface Project {
  id: ID;
  name: string;
  items: PlanItem[];
  deps: Dependency[];
  tags: Tag[];
  createdAt: number;
  updatedAt: number;
}

export interface AppState {
  projects: Project[];
}
