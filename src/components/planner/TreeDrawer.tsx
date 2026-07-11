import { useState } from "react";
import { Check, ChevronRight, Home, Lock } from "lucide-react";
import type { ID, PlanItem, Project } from "@/lib/types";
import { childrenMap, computeBlocked, computeProgress } from "@/lib/logic";
import { COLOR_HEX } from "@/lib/colors";
import { moveItem } from "@/lib/store";
import { TYPE_ICON } from "./nodes";
import { toast } from "../Toast";

interface TreeDrawerProps {
  project: Project;
  selectedId: ID | null;
  /** Filter result — items outside it render dimmed. Null = no filter. */
  visible: Set<ID> | null;
  onSelect: (id: ID) => void;
}

/**
 * Collapsible outline of the whole task tree: navigation, expand/collapse,
 * and drag-and-drop reparenting (drop a task onto a group, a task, or the
 * project row to move it there).
 */
export function TreeDrawer({ project, selectedId, visible, onSelect }: TreeDrawerProps) {
  const [collapsed, setCollapsed] = useState<Set<ID>>(new Set());
  const [dragId, setDragId] = useState<ID | null>(null);
  const [dropId, setDropId] = useState<ID | null | "root">(null);

  const children = childrenMap(project.items);
  const progress = computeProgress(project.items);
  const blocked = computeBlocked(project.items, project.deps);

  const toggleCollapsed = (id: ID) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDrop = (targetId: ID | null) => {
    if (!dragId) return;
    const error = moveItem(project.id, dragId, targetId);
    if (error) toast(error);
    setDragId(null);
    setDropId(null);
  };

  const dropProps = (targetId: ID | null | "root") => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      setDropId(targetId);
    },
    onDragLeave: () => setDropId((current) => (current === targetId ? null : current)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      handleDrop(targetId === "root" ? null : targetId);
    },
  });

  const renderItem = (item: PlanItem, depth: number): React.ReactNode => {
    const kids = children.get(item.id) ?? [];
    const isParent = kids.length > 0;
    const isCollapsed = collapsed.has(item.id);
    const itemProgress = progress.get(item.id);
    const isBlocked = (blocked.get(item.id)?.blocked ?? false) && !item.done;
    const dimmed = visible !== null && !visible.has(item.id);
    const Icon = TYPE_ICON[item.type];

    return (
      <div key={item.id}>
        <div
          draggable={item.type === "task"}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", item.id);
            e.dataTransfer.effectAllowed = "move";
            setDragId(item.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropId(null);
          }}
          {...dropProps(item.id)}
          onClick={() => onSelect(item.id)}
          className={`group flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 text-[12.5px] select-none ${
            selectedId === item.id
              ? "bg-blue-50 text-blue-800"
              : "text-slate-700 hover:bg-slate-100"
          } ${dropId === item.id ? "ring-2 ring-blue-400 ring-inset" : ""} ${
            dimmed ? "opacity-35" : ""
          }`}
          style={{ paddingLeft: depth * 14 + 6 }}
          data-testid={`drawer-item-${item.id}`}
        >
          <button
            type="button"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed(item.id);
            }}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 ${
              isParent ? "" : "invisible"
            }`}
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
            />
          </button>
          {item.type === "group" ? (
            <Icon size={13} style={{ color: COLOR_HEX[item.color] }} className="shrink-0" />
          ) : (
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                item.done
                  ? "border-green-500 bg-green-500 text-white"
                  : isBlocked
                    ? "border-amber-300 bg-amber-50 text-amber-600"
                    : "border-slate-300 bg-white"
              }`}
            >
              {item.done && <Check size={9} strokeWidth={4} />}
              {!item.done && isBlocked && <Lock size={8} />}
            </span>
          )}
          <span
            className={`min-w-0 flex-1 truncate ${item.done ? "text-slate-400 line-through" : ""}`}
          >
            {item.title || "Untitled"}
          </span>
          {isParent && itemProgress && (
            <span className="shrink-0 text-[10.5px] text-slate-400 tabular-nums">
              {itemProgress.done}/{itemProgress.total}
            </span>
          )}
        </div>
        {isParent && !isCollapsed && kids.map((kid) => renderItem(kid, depth + 1))}
      </div>
    );
  };

  const roots = children.get(null) ?? [];

  return (
    <aside
      className="flex w-[250px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-2"
      data-testid="tree-drawer"
    >
      <div
        {...dropProps("root")}
        className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase ${
          dropId === "root" ? "ring-2 ring-blue-400 ring-inset" : ""
        }`}
        title="Drop here to move an item to the root"
      >
        <Home size={12} />
        {project.name || "Project"}
      </div>
      {roots.length === 0 ? (
        <div className="px-2 py-4 text-[12px] text-slate-400">No items yet.</div>
      ) : (
        roots.map((root) => renderItem(root, 0))
      )}
      {dragId && (
        <div className="mt-2 rounded-md bg-slate-50 px-2 py-2 text-center text-[11px] text-slate-400">
          Drop on a group or task to move it there
        </div>
      )}
    </aside>
  );
}
