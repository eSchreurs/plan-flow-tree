export type ID = string;

export const ITEM_TYPES = ["category", "requirement", "phase", "task"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/**
 * Hierarchy rank. A parent's rank must be strictly lower than its child's,
 * but layers may be skipped (e.g. tasks directly under a category) and any
 * type may live at the root: Category ⊃ Requirement ⊃ Phase ⊃ Task.
 */
export const TYPE_RANK: Record<ItemType, number> = {
  category: 0,
  requirement: 1,
  phase: 2,
  task: 3,
};

export const TYPE_LABEL: Record<ItemType, string> = {
  category: "Category",
  requirement: "Requirement",
  phase: "Phase",
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

export interface PlanItem {
  id: ID;
  type: ItemType;
  parentId: ID | null;
  title: string;
  description: string;
  color: ColorKey;
  /**
   * Completion. Manually toggled on leaves (items without children);
   * recomputed from children for containers on every mutation.
   */
  done: boolean;
  /** Sibling sort order (insertion order). */
  order: number;
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
  createdAt: number;
  updatedAt: number;
}

export interface AppState {
  projects: Project[];
}
