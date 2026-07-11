import { useEffect, useState } from "react";
import { ArrowRight, Plus, Trash2, X } from "lucide-react";
import type { ID, ItemType, Project } from "@/lib/types";
import { COLOR_KEYS, TYPE_LABEL } from "@/lib/types";
import {
  allowedChildTypes,
  blockingSources,
  childrenMap,
  computeProgress,
  itemMap,
} from "@/lib/logic";
import { COLOR_HEX } from "@/lib/colors";
import { addTag, deleteDep, deleteItem, toggleItemTag, updateItem } from "@/lib/store";
import { TYPE_ICON } from "./nodes";

export type Selection = { kind: "item" | "dep"; id: ID } | null;

interface InspectorProps {
  project: Project;
  selection: Selection;
  onClose: () => void;
  onAddChild: (parentId: ID, type: ItemType) => void;
  onSelect: (selection: Selection) => void;
}

function ConfirmDeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [arming, setArming] = useState(false);
  useEffect(() => {
    if (!arming) return;
    const timer = setTimeout(() => setArming(false), 2500);
    return () => clearTimeout(timer);
  }, [arming]);
  return (
    <button
      type="button"
      onClick={() => {
        if (arming) onDelete();
        else setArming(true);
      }}
      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors ${
        arming
          ? "border-red-300 bg-red-500 text-white"
          : "border-red-200 bg-white text-red-600 hover:bg-red-50"
      }`}
    >
      <Trash2 size={13} />
      {arming ? "Click again to confirm" : label}
    </button>
  );
}

export function Inspector({ project, selection, onClose, onAddChild, onSelect }: InspectorProps) {
  if (!selection) return null;
  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
      {selection.kind === "item" ? (
        <ItemPanel
          key={selection.id}
          project={project}
          itemId={selection.id}
          onClose={onClose}
          onAddChild={onAddChild}
          onSelect={onSelect}
        />
      ) : (
        <DepPanel project={project} depId={selection.id} onClose={onClose} onSelect={onSelect} />
      )}
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">
      {children}
    </div>
  );
}

function ItemPanel({
  project,
  itemId,
  onClose,
  onAddChild,
  onSelect,
}: {
  project: Project;
  itemId: ID;
  onClose: () => void;
  onAddChild: (parentId: ID, type: ItemType) => void;
  onSelect: (selection: Selection) => void;
}) {
  const [newTag, setNewTag] = useState("");
  const byId = itemMap(project.items);
  const item = byId.get(itemId);
  if (!item) return null;

  const children = childrenMap(project.items).get(item.id) ?? [];
  const progress = computeProgress(project.items).get(item.id);
  const blockers = blockingSources(project.items, project.deps, item.id);
  const childTypes = allowedChildTypes(item.type);
  const incoming = project.deps.filter((d) => d.target === item.id);
  const outgoing = project.deps.filter((d) => d.source === item.id);
  const Icon = TYPE_ICON[item.type];

  const createTag = () => {
    const name = newTag.trim();
    if (!name) return;
    const existing = project.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const tagId = existing ? existing.id : addTag(project.id, name);
    if (!item.tagIds.includes(tagId)) toggleItemTag(project.id, item.id, tagId);
    setNewTag("");
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md text-white"
          style={{ background: COLOR_HEX[item.color] }}
        >
          <Icon size={13} />
        </span>
        <span className="text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
          {TYPE_LABEL[item.type]}
        </span>
        {item.done && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
            Done
          </span>
        )}
        {!item.done && blockers.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            Blocked
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>

      <div>
        <SectionLabel>Title</SectionLabel>
        <input
          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          value={item.title}
          onChange={(e) => updateItem(project.id, item.id, { title: e.target.value })}
        />
      </div>

      <div>
        <SectionLabel>Description</SectionLabel>
        <textarea
          className="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          rows={3}
          placeholder="Optional details…"
          value={item.description}
          onChange={(e) => updateItem(project.id, item.id, { description: e.target.value })}
        />
      </div>

      <div>
        <SectionLabel>Color</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              title={key}
              onClick={() => updateItem(project.id, item.id, { color: key })}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                item.color === key ? "border-slate-700" : "border-transparent"
              }`}
              style={{ background: COLOR_HEX[key] }}
              aria-label={`Color ${key}`}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Tags</SectionLabel>
        <div className="flex flex-wrap items-center gap-1.5">
          {project.tags.map((tag) => {
            const active = item.tagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleItemTag(project.id, item.id, tag.id)}
                title={active ? "Remove tag" : "Add tag"}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-medium ${
                  active ? "text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
                style={
                  active
                    ? { background: COLOR_HEX[tag.color], borderColor: COLOR_HEX[tag.color] }
                    : { borderColor: "#e2e8f0" }
                }
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: active ? "#fff" : COLOR_HEX[tag.color] }}
                />
                {tag.name}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTag()}
            placeholder="New tag…"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-blue-400"
          />
          <button
            type="button"
            onClick={createTag}
            disabled={!newTag.trim()}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Create tag"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {children.length > 0 && progress && (
        <div>
          <SectionLabel>
            Progress · {progress.done}/{progress.total}
          </SectionLabel>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }}
            />
          </div>
        </div>
      )}

      {!item.done && blockers.length > 0 && (
        <div>
          <SectionLabel>Blocked by</SectionLabel>
          <div className="flex flex-col gap-1">
            {blockers.map((blocker) => (
              <button
                key={blocker.id}
                type="button"
                onClick={() => onSelect({ kind: "item", id: blocker.id })}
                className="flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-left text-[12px] text-amber-800 hover:bg-amber-100"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: COLOR_HEX[blocker.color] }}
                />
                {blocker.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {(incoming.length > 0 || outgoing.length > 0) && (
        <div>
          <SectionLabel>Dependencies</SectionLabel>
          <div className="flex flex-col gap-1">
            {incoming.map((dep) => (
              <DepRow
                key={dep.id}
                label={byId.get(dep.source)?.title ?? "?"}
                direction="in"
                onJump={() => onSelect({ kind: "item", id: dep.source })}
                onDelete={() => deleteDep(project.id, dep.id)}
              />
            ))}
            {outgoing.map((dep) => (
              <DepRow
                key={dep.id}
                label={byId.get(dep.target)?.title ?? "?"}
                direction="out"
                onJump={() => onSelect({ kind: "item", id: dep.target })}
                onDelete={() => deleteDep(project.id, dep.id)}
              />
            ))}
          </div>
        </div>
      )}

      {childTypes.length > 0 && (
        <div>
          <SectionLabel>Add inside</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {childTypes.map((type) => {
              const TypeIcon = TYPE_ICON[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onAddChild(item.id, type)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                >
                  <TypeIcon size={12} />
                  {item.type === "task" ? "Subtask" : TYPE_LABEL[type]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-2 border-t border-slate-100 pt-4">
        <ConfirmDeleteButton
          label={
            children.length > 0
              ? `Delete + ${children.length === 1 ? "1 child" : "children"}`
              : `Delete ${TYPE_LABEL[item.type].toLowerCase()}`
          }
          onDelete={() => {
            deleteItem(project.id, item.id);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

function DepRow({
  label,
  direction,
  onJump,
  onDelete,
}: {
  label: string;
  direction: "in" | "out";
  onJump: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-[12px] text-slate-700">
      <ArrowRight
        size={12}
        className={`shrink-0 text-slate-400 ${direction === "in" ? "rotate-180" : ""}`}
      />
      <button
        type="button"
        onClick={onJump}
        className="min-w-0 flex-1 truncate text-left hover:text-blue-600"
        title={direction === "in" ? `Waits for “${label}”` : `Must finish before “${label}”`}
      >
        {direction === "in" ? `after ${label}` : `before ${label}`}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-0.5 text-slate-300 group-hover:text-slate-400 hover:!text-red-500"
        aria-label="Remove dependency"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function DepPanel({
  project,
  depId,
  onClose,
  onSelect,
}: {
  project: Project;
  depId: ID;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
}) {
  const dep = project.deps.find((d) => d.id === depId);
  if (!dep) return null;
  const byId = itemMap(project.items);
  const source = byId.get(dep.source);
  const target = byId.get(dep.target);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
          Dependency
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 text-[13px]">
        <button
          type="button"
          className="flex items-center gap-2 text-left font-medium text-slate-800 hover:text-blue-600"
          onClick={() => source && onSelect({ kind: "item", id: source.id })}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: COLOR_HEX[source?.color ?? "slate"] }}
          />
          {source?.title ?? "?"}
        </button>
        <div className="flex items-center gap-2 pl-0.5 text-[11px] text-slate-400">
          <ArrowRight size={12} /> must finish before
        </div>
        <button
          type="button"
          className="flex items-center gap-2 text-left font-medium text-slate-800 hover:text-blue-600"
          onClick={() => target && onSelect({ kind: "item", id: target.id })}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: COLOR_HEX[target?.color ?? "slate"] }}
          />
          {target?.title ?? "?"}
        </button>
      </div>

      <ConfirmDeleteButton
        label="Remove dependency"
        onDelete={() => {
          deleteDep(project.id, dep.id);
          onClose();
        }}
      />
    </div>
  );
}
