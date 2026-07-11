import type { AppState, ColorKey, ID, PlanItem, Project, Tag } from "./types";
import { COLOR_KEYS } from "./types";
import { rollUpDone } from "./logic";

/**
 * Migrate the v1 model (category ⊃ requirement ⊃ phase ⊃ task) into the v2
 * model (group ⊃ task*):
 *
 *  - categories → colored tags on everything they contained; their direct
 *    children move to the root
 *  - requirements → groups
 *  - phases → parent tasks (children preserved as subtasks)
 *  - dependencies survive unless an endpoint was a category (which no longer
 *    exists as an item)
 */

interface V1Item {
  id: ID;
  type: "category" | "requirement" | "phase" | "task";
  parentId: ID | null;
  title: string;
  description?: string;
  color?: string;
  done?: boolean;
  order?: number;
}

interface V1Project {
  id: ID;
  name: string;
  items: V1Item[];
  deps: { id: ID; source: ID; target: ID }[];
  createdAt?: number;
  updatedAt?: number;
}

function asColor(value: string | undefined): ColorKey {
  return (COLOR_KEYS as readonly string[]).includes(value ?? "") ? (value as ColorKey) : "slate";
}

export function migrateV1(raw: unknown): AppState | null {
  const parsed = raw as { projects?: V1Project[] };
  if (!parsed || !Array.isArray(parsed.projects)) return null;

  const projects: Project[] = [];
  for (const old of parsed.projects) {
    if (!Array.isArray(old.items) || !Array.isArray(old.deps)) return null;
    const byId = new Map(old.items.map((i) => [i.id, i]));
    const categories = old.items.filter((i) => i.type === "category");
    const categoryIds = new Set(categories.map((c) => c.id));

    const tags: Tag[] = categories.map((c) => ({
      id: c.id,
      name: c.title || "Untitled",
      color: asColor(c.color),
    }));

    /** Nearest category ancestor in the OLD hierarchy → tag id. */
    const categoryTagOf = (item: V1Item): ID | null => {
      let current: V1Item | undefined = item;
      const guard = new Set<ID>();
      while (current?.parentId && !guard.has(current.id)) {
        guard.add(current.id);
        const parent = byId.get(current.parentId);
        if (!parent) break;
        if (parent.type === "category") return parent.id;
        current = parent;
      }
      return null;
    };

    const items: PlanItem[] = old.items
      .filter((i) => i.type !== "category")
      .map((i) => {
        const tag = categoryTagOf(i);
        const parentWasCategory = i.parentId !== null && categoryIds.has(i.parentId);
        return {
          id: i.id,
          type: i.type === "requirement" ? ("group" as const) : ("task" as const),
          parentId: parentWasCategory ? null : i.parentId,
          title: i.title ?? "",
          description: i.description ?? "",
          color: asColor(i.color),
          done: i.done ?? false,
          order: i.order ?? 0,
          tagIds: tag ? [tag] : [],
        };
      });

    const deps = old.deps.filter((d) => !categoryIds.has(d.source) && !categoryIds.has(d.target));

    rollUpDone(items);
    projects.push({
      id: old.id,
      name: old.name ?? "Untitled project",
      items,
      deps,
      tags,
      createdAt: old.createdAt ?? Date.now(),
      updatedAt: old.updatedAt ?? Date.now(),
    });
  }
  return { projects };
}
