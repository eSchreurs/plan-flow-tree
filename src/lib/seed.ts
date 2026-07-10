import type { AppState, ColorKey, ID, ItemType, PlanItem, Project } from "./types";
import { rollUpDone } from "./logic";

interface SeedNode {
  type: ItemType;
  title: string;
  description?: string;
  color?: ColorKey;
  done?: boolean;
  /** Titles of earlier seed nodes this one depends on. */
  after?: string[];
  children?: SeedNode[];
}

function buildProject(id: ID, name: string, nodes: SeedNode[], createdAt: number): Project {
  const project: Project = { id, name, items: [], deps: [], createdAt, updatedAt: createdAt };
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
      {
        type: "category",
        title: "Foundation",
        color: "blue",
        children: [
          {
            type: "requirement",
            title: "Design system",
            color: "violet",
            description: "Shared visual language for every page.",
            children: [
              {
                type: "phase",
                title: "Audit",
                color: "amber",
                children: [
                  { type: "task", title: "Inventory existing components", done: true },
                  { type: "task", title: "Collect brand assets", done: true },
                ],
              },
              {
                type: "phase",
                title: "Build",
                color: "blue",
                after: ["Audit"],
                children: [
                  { type: "task", title: "Color & typography tokens", done: true },
                  {
                    type: "task",
                    title: "Core component set",
                    description: "Buttons, forms, cards, navigation.",
                  },
                  { type: "task", title: "Usage documentation" },
                ],
              },
            ],
          },
          {
            type: "requirement",
            title: "Infrastructure",
            color: "teal",
            children: [
              { type: "task", title: "Set up hosting", done: true },
              { type: "task", title: "CI/CD pipeline", color: "teal" },
            ],
          },
        ],
      },
      {
        type: "category",
        title: "Launch",
        color: "violet",
        after: ["Foundation"],
        children: [
          {
            type: "requirement",
            title: "Marketing site",
            color: "pink",
            after: ["Design system"],
            children: [
              {
                type: "phase",
                title: "Content",
                color: "green",
                children: [
                  { type: "task", title: "Copywriting" },
                  { type: "task", title: "Product screenshots" },
                ],
              },
              {
                type: "phase",
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
            type: "phase",
            title: "QA & release",
            color: "red",
            after: ["Marketing site"],
            description: "Final checks before going public.",
            children: [
              { type: "task", title: "Cross-browser pass" },
              { type: "task", title: "Performance audit" },
              { type: "task", title: "Go live" },
            ],
          },
        ],
      },
      {
        type: "task",
        title: "Announce on social media",
        color: "amber",
        after: ["Launch"],
      },
    ],
    now,
  );

  const chores = buildProject(
    "demo-chores",
    "Weekend Chores",
    [
      { type: "task", title: "Groceries", color: "green", done: true },
      { type: "task", title: "Meal prep", color: "green", after: ["Groceries"] },
      {
        type: "phase",
        title: "Garden",
        color: "teal",
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
