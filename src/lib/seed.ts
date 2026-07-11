import type { AppState, ColorKey, ID, ItemType, Project } from "./types";
import { rollUpDone } from "./logic";

interface SeedNode {
  type: ItemType;
  title: string;
  description?: string;
  color?: ColorKey;
  done?: boolean;
  /** Titles of earlier seed nodes this one depends on. */
  after?: string[];
  /** Tag names (declared in SeedProjectTags). */
  tags?: string[];
  children?: SeedNode[];
}

function buildProject(
  id: ID,
  name: string,
  tagDefs: { name: string; color: ColorKey }[],
  nodes: SeedNode[],
  createdAt: number,
): Project {
  const project: Project = {
    id,
    name,
    items: [],
    deps: [],
    tags: tagDefs.map((tag, index) => ({ id: `${id}-t${index + 1}`, ...tag })),
    createdAt,
    updatedAt: createdAt,
  };
  const tagByName = new Map(project.tags.map((t) => [t.name, t.id]));
  const byTitle = new Map<string, ID>();
  let counter = 0;

  const add = (node: SeedNode, parentId: ID | null, order: number) => {
    const itemId = `${id}-i${++counter}`;
    project.items.push({
      id: itemId,
      type: node.type,
      parentId,
      title: node.title,
      description: node.description ?? "",
      color: node.color ?? "slate",
      done: node.done ?? false,
      order,
      tagIds: (node.tags ?? []).flatMap((n) => (tagByName.has(n) ? [tagByName.get(n)!] : [])),
    });
    byTitle.set(node.title, itemId);
    node.children?.forEach((child, index) => add(child, itemId, index));
  };
  nodes.forEach((node, index) => add(node, null, index));

  const link = (node: SeedNode) => {
    for (const sourceTitle of node.after ?? []) {
      const source = byTitle.get(sourceTitle);
      const target = byTitle.get(node.title);
      if (source && target) {
        project.deps.push({ id: `${id}-d${project.deps.length + 1}`, source, target });
      }
    }
    node.children?.forEach(link);
  };
  nodes.forEach(link);

  rollUpDone(project.items);
  return project;
}

export function createDemoState(now: number): AppState {
  const relaunch = buildProject(
    "demo-relaunch",
    "Website Relaunch",
    [
      { name: "Foundation", color: "blue" },
      { name: "Launch", color: "violet" },
    ],
    [
      {
        type: "group",
        title: "Design system",
        color: "violet",
        description: "Shared visual language for every page.",
        tags: ["Foundation"],
        children: [
          {
            type: "task",
            title: "Audit",
            color: "amber",
            children: [
              { type: "task", title: "Inventory existing components", done: true },
              { type: "task", title: "Collect brand assets", done: true },
            ],
          },
          {
            type: "task",
            title: "Build",
            color: "blue",
            after: ["Audit"],
            children: [
              { type: "task", title: "Color & typography tokens", done: true },
              {
                type: "task",
                title: "Core component set",
                description: "Buttons, forms, cards, navigation.",
                children: [
                  { type: "task", title: "Buttons & inputs", done: true },
                  { type: "task", title: "Cards & navigation" },
                ],
              },
              { type: "task", title: "Usage documentation" },
            ],
          },
        ],
      },
      {
        type: "group",
        title: "Infrastructure",
        color: "teal",
        tags: ["Foundation"],
        children: [
          { type: "task", title: "Set up hosting", done: true },
          { type: "task", title: "CI/CD pipeline" },
        ],
      },
      {
        type: "group",
        title: "Marketing site",
        color: "pink",
        tags: ["Launch"],
        after: ["Design system"],
        children: [
          {
            type: "task",
            title: "Content",
            color: "green",
            children: [
              { type: "task", title: "Copywriting" },
              { type: "task", title: "Product screenshots" },
            ],
          },
          {
            type: "task",
            title: "Pages",
            color: "blue",
            after: ["Content"],
            children: [
              { type: "task", title: "Home page", after: ["Copywriting"] },
              { type: "task", title: "Pricing page" },
              { type: "task", title: "Blog" },
            ],
          },
        ],
      },
      {
        type: "task",
        title: "QA & release",
        color: "red",
        description: "Final checks before going public.",
        tags: ["Launch"],
        after: ["Marketing site"],
        children: [
          { type: "task", title: "Cross-browser pass" },
          { type: "task", title: "Performance audit" },
          { type: "task", title: "Go live" },
        ],
      },
      {
        type: "task",
        title: "Announce on social media",
        color: "amber",
        tags: ["Launch"],
        after: ["QA & release"],
      },
    ],
    now,
  );

  const chores = buildProject(
    "demo-chores",
    "Weekend Chores",
    [{ name: "Outside", color: "green" }],
    [
      { type: "task", title: "Groceries", color: "green", done: true },
      { type: "task", title: "Meal prep", color: "green", after: ["Groceries"] },
      {
        type: "task",
        title: "Garden",
        color: "teal",
        tags: ["Outside"],
        children: [
          { type: "task", title: "Mow the lawn" },
          { type: "task", title: "Water plants", done: true },
        ],
      },
      { type: "task", title: "Clean the kitchen", color: "blue" },
    ],
    now - 86_400_000,
  );

  return { projects: [relaunch, chores] };
}
