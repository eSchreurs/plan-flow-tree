import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Check, Flag, Folder, ListTodo, Lock, Milestone, Plus } from "lucide-react";
import type { ID, ItemType, PlanItem } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import type { Progress } from "@/lib/logic";
import { COLOR_HEX } from "@/lib/colors";
import { toggleDone, updateItem } from "@/lib/store";

export interface PlanNodeData {
  projectId: ID;
  item: PlanItem;
  isLeaf: boolean;
  /** Effectively blocked (own or inherited) and not yet done. */
  blocked: boolean;
  progress: Progress | null;
  childTypes: ItemType[];
  autoFocus: boolean;
  onAddChild: (type: ItemType) => void;
}

export const TYPE_ICON: Record<ItemType, typeof Folder> = {
  category: Folder,
  requirement: Flag,
  phase: Milestone,
  task: ListTodo,
};

function TitleInput({ data }: { data: PlanNodeData }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (data.autoFocus && ref.current) {
      ref.current.focus({ preventScroll: true });
      ref.current.select();
    }
    // focus only when the node is first mounted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <input
      ref={ref}
      className="pf-title nodrag"
      value={data.item.title}
      placeholder={TYPE_LABEL[data.item.type]}
      onChange={(e) => updateItem(data.projectId, data.item.id, { title: e.target.value })}
    />
  );
}

function CheckButton({ data }: { data: PlanNodeData }) {
  const { item, isLeaf, blocked, progress } = data;
  if (!isLeaf) {
    // Containers derive their state — show progress, or a filled check when complete.
    if (item.done) {
      return (
        <span className="pf-check is-done is-derived" aria-label="All children done">
          <Check size={12} strokeWidth={3.5} />
        </span>
      );
    }
    return (
      <span className="pf-progress" aria-label="Progress">
        {progress ? `${progress.done}/${progress.total}` : ""}
      </span>
    );
  }
  const disabled = blocked && !item.done;
  return (
    <button
      type="button"
      className={`pf-check nodrag ${item.done ? "is-done" : ""}`}
      disabled={disabled}
      title={disabled ? "Blocked — finish its dependencies first" : "Mark done"}
      onClick={(e) => {
        e.stopPropagation();
        toggleDone(data.projectId, item.id);
      }}
      aria-label="Toggle done"
    >
      {item.done && <Check size={12} strokeWidth={3.5} />}
    </button>
  );
}

function AddChildButton({ data }: { data: PlanNodeData }) {
  const [open, setOpen] = useState(false);
  if (data.childTypes.length === 0) return null;
  return (
    <div className="pf-add nodrag nopan">
      <button
        type="button"
        className="pf-add-btn"
        title="Add child item"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Plus size={13} strokeWidth={2.5} />
      </button>
      {open && (
        <>
          <div className="pf-add-backdrop" onClick={() => setOpen(false)} />
          <div className="pf-add-menu">
            {data.childTypes.map((type) => {
              const Icon = TYPE_ICON[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    data.onAddChild(type);
                  }}
                >
                  <Icon size={13} />
                  {TYPE_LABEL[type]}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function BlockedBadge({ data }: { data: PlanNodeData }) {
  if (!data.blocked || data.item.done) return null;
  return (
    <span className="pf-lock" title="Blocked by unfinished dependencies">
      <Lock size={11} />
    </span>
  );
}

function DepHandles({ topOffset }: { topOffset?: number }) {
  const style = topOffset !== undefined ? { top: topOffset } : undefined;
  return (
    <>
      <Handle type="target" position={Position.Left} id="in" className="pf-handle" style={style} />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="pf-handle pf-handle-out"
        style={style}
      />
    </>
  );
}

/** Hidden anchor for parent → child tree connectors. */
function TreeSourceHandle() {
  return (
    <Handle
      type="source"
      position={Position.Bottom}
      id="tree"
      className="pf-handle-hidden"
      style={{ left: 16 }}
    />
  );
}

export const TaskNode = memo(function TaskNode({ data }: NodeProps<PlanNodeData>) {
  const { item, blocked } = data;
  const cls = [
    "pf-node pf-task",
    item.done ? "is-done" : "",
    blocked && !item.done ? "is-blocked" : "",
  ].join(" ");
  return (
    <div className={cls} style={{ "--item": COLOR_HEX[item.color] } as React.CSSProperties}>
      <CheckButton data={data} />
      <div className="pf-body">
        <div className="pf-row">
          <TitleInput data={data} />
          <BlockedBadge data={data} />
        </div>
        {item.description.trim() && <div className="pf-desc">{item.description}</div>}
      </div>
      <DepHandles />
    </div>
  );
});

export const PhaseNode = memo(function PhaseNode({ data }: NodeProps<PlanNodeData>) {
  const { item, blocked } = data;
  const cls = [
    "pf-node pf-phase",
    item.done ? "is-done" : "",
    blocked && !item.done ? "is-blocked" : "",
  ].join(" ");
  return (
    <div className={cls} style={{ "--item": COLOR_HEX[item.color] } as React.CSSProperties}>
      <Milestone size={14} className="pf-type-icon" />
      <div className="pf-body">
        <div className="pf-row">
          <TitleInput data={data} />
          <BlockedBadge data={data} />
          <CheckButton data={data} />
        </div>
        {item.description.trim() && <div className="pf-desc">{item.description}</div>}
      </div>
      <AddChildButton data={data} />
      <DepHandles />
      <TreeSourceHandle />
    </div>
  );
});

export const RequirementNode = memo(function RequirementNode({ data }: NodeProps<PlanNodeData>) {
  const { item, blocked } = data;
  const cls = [
    "pf-node pf-req",
    item.done ? "is-done" : "",
    blocked && !item.done ? "is-blocked" : "",
  ].join(" ");
  return (
    <div className={cls} style={{ "--item": COLOR_HEX[item.color] } as React.CSSProperties}>
      <Flag size={13} className="pf-type-icon" />
      <div className="pf-body">
        <div className="pf-row">
          <TitleInput data={data} />
          <BlockedBadge data={data} />
          <CheckButton data={data} />
        </div>
        {item.description.trim() && <div className="pf-desc">{item.description}</div>}
      </div>
      <AddChildButton data={data} />
      <DepHandles />
      <TreeSourceHandle />
    </div>
  );
});

export const CategoryNode = memo(function CategoryNode({ data }: NodeProps<PlanNodeData>) {
  const { item, blocked, isLeaf } = data;
  const cls = [
    "pf-cat",
    item.done ? "is-done" : "",
    blocked && !item.done ? "is-blocked" : "",
  ].join(" ");
  return (
    <div className={cls} style={{ "--item": COLOR_HEX[item.color] } as React.CSSProperties}>
      <div className="pf-cat-header">
        <Folder size={14} className="pf-type-icon" />
        <TitleInput data={data} />
        <BlockedBadge data={data} />
        <CheckButton data={data} />
        <AddChildButton data={data} />
      </div>
      {isLeaf && <div className="pf-cat-empty">Empty category — use + to add items</div>}
      <DepHandles topOffset={22} />
    </div>
  );
});

export const nodeTypes = {
  task: TaskNode,
  phase: PhaseNode,
  requirement: RequirementNode,
  category: CategoryNode,
};
