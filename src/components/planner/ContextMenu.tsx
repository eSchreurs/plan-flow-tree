import { useLayoutEffect, useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  CornerDownRight,
  Lock,
  SlidersHorizontal,
  Trash2,
  Unlink,
} from "lucide-react";
import type { ID, ItemType, Project } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import { allowedChildTypes, childrenMap, computeBlocked, subtreeIds } from "@/lib/logic";
import { deleteDep, deleteItem, deleteTag, duplicateItem, toggleDone } from "@/lib/store";
import { TYPE_ICON } from "./nodes";
import type { Selection } from "./Inspector";
import { toast } from "../Toast";

export type MenuState =
  | { kind: "pane"; x: number; y: number; parentId: ID | null; order: number; between: boolean }
  | { kind: "node"; x: number; y: number; itemId: ID }
  | { kind: "edge"; x: number; y: number; depId: ID }
  | { kind: "tag"; x: number; y: number; tagId: ID };

interface Entry {
  key: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  primary?: boolean;
}

interface ContextMenuProps {
  menu: MenuState;
  project: Project;
  onAdd: (parentId: ID | null, type: ItemType, order?: number) => void;
  onSelect: (selection: Selection) => void;
  onClose: () => void;
}

/** What a task is called depends on where it goes. */
function childNoun(scopeType: ItemType | null, childType: ItemType): string {
  if (childType === "task" && scopeType === "task") return "subtask";
  return TYPE_LABEL[childType].toLowerCase();
}

/** Add-entries for a scope, most granular type first (tasks are the common case). */
function addEntries(
  scopeType: ItemType | null,
  verb: string,
  add: (type: ItemType) => void,
): Entry[] {
  const types = allowedChildTypes(scopeType);
  return [...types].reverse().map((type, index) => {
    const Icon = TYPE_ICON[type];
    return {
      key: `add-${type}`,
      label: `${verb} ${childNoun(scopeType, type)}`,
      icon: <Icon size={14} />,
      action: () => add(type),
      primary: index === 0,
    };
  });
}

export function ContextMenu({ menu, project, onAdd, onSelect, onClose }: ContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Clamp to the viewport and focus the primary entry so Enter triggers it.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    if (box.right > window.innerWidth - 8) {
      panel.style.left = `${Math.max(8, window.innerWidth - box.width - 8)}px`;
    }
    if (box.bottom > window.innerHeight - 8) {
      panel.style.top = `${Math.max(8, window.innerHeight - box.height - 8)}px`;
    }
    panel.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu]);

  const byId = new Map(project.items.map((i) => [i.id, i]));
  const groups: Entry[][] = [];
  let title = "";

  if (menu.kind === "pane") {
    const scope = menu.parentId ? byId.get(menu.parentId) : undefined;
    title = scope ? scope.title || TYPE_LABEL[scope.type] : "Canvas";
    groups.push(
      addEntries(scope?.type ?? null, menu.between ? "Insert" : "Add", (type) => {
        onAdd(menu.parentId, type, menu.order);
        onClose();
      }),
    );
  }

  if (menu.kind === "node") {
    const item = byId.get(menu.itemId);
    if (!item) return null;
    title = item.title || TYPE_LABEL[item.type];
    const typeName = TYPE_LABEL[item.type].toLowerCase();

    // Add inside this item (appended at the end).
    const inside = addEntries(item.type, "Add", (type) => {
      onAdd(item.id, type);
      onClose();
    });
    if (inside.length > 0) groups.push(inside);

    // Insert a same-type sibling right above / below this item.
    const siblings = (childrenMap(project.items).get(item.parentId) ?? []).sort(
      (a, b) => a.order - b.order,
    );
    const index = siblings.findIndex((s) => s.id === item.id);
    const before = siblings[index - 1];
    const after = siblings[index + 1];
    groups.push([
      {
        key: "sib-above",
        label: `Add ${typeName} above`,
        icon: <ArrowUp size={14} />,
        action: () => {
          onAdd(
            item.parentId,
            item.type,
            before ? (before.order + item.order) / 2 : item.order - 1,
          );
          onClose();
        },
      },
      {
        key: "sib-below",
        label: `Add ${typeName} below`,
        icon: <ArrowDown size={14} />,
        action: () => {
          onAdd(item.parentId, item.type, after ? (item.order + after.order) / 2 : item.order + 1);
          onClose();
        },
      },
    ]);

    const isLeaf = (childrenMap(project.items).get(item.id) ?? []).length === 0;
    const blocked = computeBlocked(project.items, project.deps).get(item.id)?.blocked ?? false;
    const actions: Entry[] = [];
    if (isLeaf) {
      const cannotComplete = blocked && !item.done;
      actions.push({
        key: "done",
        label: item.done ? "Mark not done" : "Mark done",
        icon: cannotComplete ? <Lock size={14} /> : <Check size={14} />,
        disabled: cannotComplete,
        hint: cannotComplete ? "blocked" : undefined,
        action: () => {
          toggleDone(project.id, item.id);
          onClose();
        },
      });
    }
    actions.push(
      {
        key: "edit",
        label: `Edit ${typeName}`,
        icon: <SlidersHorizontal size={14} />,
        action: () => {
          onSelect({ kind: "item", id: item.id });
          onClose();
        },
      },
      {
        key: "duplicate",
        label: "Duplicate",
        icon: <Copy size={14} />,
        action: () => {
          const copyId = duplicateItem(project.id, item.id);
          if (copyId) onSelect({ kind: "item", id: copyId });
          onClose();
        },
      },
    );
    groups.push(actions);

    const nested = subtreeIds(project.items, item.id).size - 1;
    groups.push([
      {
        key: "delete",
        label: nested > 0 ? `Delete (+${nested} nested)` : "Delete",
        icon: <Trash2 size={14} />,
        danger: true,
        action: () => {
          deleteItem(project.id, item.id);
          onSelect(null);
          toast(
            nested > 0
              ? `Deleted “${item.title}” and ${nested} nested item${nested === 1 ? "" : "s"}.`
              : `Deleted “${item.title}”.`,
          );
          onClose();
        },
      },
    ]);
  }

  if (menu.kind === "edge") {
    const dep = project.deps.find((d) => d.id === menu.depId);
    if (!dep) return null;
    title = "Dependency";
    groups.push([
      {
        key: "unlink",
        label: "Remove dependency",
        icon: <Unlink size={14} />,
        danger: true,
        primary: true,
        action: () => {
          deleteDep(project.id, dep.id);
          onSelect(null);
          onClose();
        },
      },
    ]);
  }

  if (menu.kind === "tag") {
    const tag = project.tags.find((t) => t.id === menu.tagId);
    if (!tag) return null;
    title = `Tag: ${tag.name}`;
    groups.push([
      {
        key: "delete-tag",
        label: "Delete tag",
        icon: <Trash2 size={14} />,
        danger: true,
        primary: true,
        action: () => {
          deleteTag(project.id, tag.id);
          toast(`Deleted tag “${tag.name}”.`);
          onClose();
        },
      },
    ]);
  }

  return (
    <div className="fixed inset-0 z-50" onContextMenu={(e) => e.preventDefault()}>
      <div className="absolute inset-0" onMouseDown={onClose} />
      <div
        ref={panelRef}
        role="menu"
        data-testid="ctx-menu"
        className="absolute min-w-[190px] rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        style={{ left: menu.x, top: menu.y }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="truncate px-3 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">
          {title}
        </div>
        {groups
          .filter((g) => g.length > 0)
          .map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-1 border-t border-slate-100 pt-1" : ""}>
              {group.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="menuitem"
                  disabled={entry.disabled}
                  onClick={entry.action}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] outline-none ${
                    entry.danger
                      ? "text-red-600 hover:bg-red-50 focus:bg-red-50"
                      : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100"
                  } ${entry.disabled ? "cursor-not-allowed opacity-45" : ""} ${
                    entry.primary ? "font-semibold" : ""
                  }`}
                >
                  <span className={entry.danger ? "text-red-500" : "text-slate-400"}>
                    {entry.icon}
                  </span>
                  {entry.label}
                  {entry.hint && (
                    <span className="ml-auto text-[10.5px] text-slate-400">{entry.hint}</span>
                  )}
                  {entry.primary && !entry.hint && (
                    <CornerDownRight size={11} className="ml-auto text-slate-300" />
                  )}
                </button>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
