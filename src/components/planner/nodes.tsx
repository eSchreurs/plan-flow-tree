import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Check, Folder, ListTodo, Lock, Plus } from "lucide-react";
import type { ID, ItemType, PlanItem } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import type { Progress } from "@/lib/logic";
import { COLOR_HEX } from "@/lib/colors";
import { toggleDone, updateItem } from "@/lib/store";

export interface PlanNodeData {
  projectId: ID;
  item: PlanItem;
  isLeaf: boolean;
  /** Renders as a box (groups + top-level parent tasks). Deep parents stay cards. */
  isContainer: boolean;
  /** Effectively blocked (own or inherited) and not yet done. */
  blocked: boolean;
  progress: Progress | null;
  childTypes: ItemType[];
  autoFocus: boolean;
  onAddChild: (type: ItemType) => void;
}

export const TYPE_ICON: Record<ItemType, typeof Folder> = {
  group: Folder,
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
  const { item, isLeaf, progress } = data;
  if (!isLeaf) {
    // Parents derive their state — show progress, or a filled check when complete.
    if (item.done) {
      return (
        <span className="pf-check is-done is-derived" aria-label="All children done">
          <Check size={12} strokeWidth={3.5} />
        </span>
      );
    }
    return (
      <span className="pf-progress" aria-label="Progress">
        {progress ? `${progress.done}/${progress.total}` : "0/0"}
      </span>
    );
  }
  const disabled = data.blocked && !item.done;
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
        title={data.item.type === "group" ? "Add task" : "Add subtask"}
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
                  {data.item.type === "group" ? "Task" : "Subtask"}
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

export const TaskNode = memo(function TaskNode({ data }: NodeProps<PlanNodeData>) {
  const { item, blocked, isLeaf, isContainer } = data;
  const state = [item.done ? "is-done" : "", blocked && !item.done ? "is-blocked" : ""].join(" ");

  // Top-level parent tasks wrap their subtree in a box; everything else —
  // leaves AND deeper parents — stays a card (deep children hang below it,
  // connected with branch lines).
  if (!isContainer) {
    return (
      <div
        className={`pf-node pf-task ${state}`}
        style={{ "--item": COLOR_HEX[item.color] } as React.CSSProperties}
      >
        <CheckButton data={data} />
        <div className="pf-body">
          <div className="pf-row">
            <TitleInput data={data} />
            <BlockedBadge data={data} />
          </div>
          {item.description.trim() && <div className="pf-desc">{item.description}</div>}
        </div>
        <AddChildButton data={data} />
        <DepHandles />
        {!isLeaf && (
          <Handle
            type="source"
            position={Position.Bottom}
            id="tree"
            className="pf-handle-hidden"
            style={{ left: 16 }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`pf-taskbox ${state}`}
      style={{ "--item": COLOR_HEX[item.color] } as React.CSSProperties}
    >
      <div className="pf-taskbox-header">
        <CheckButton data={data} />
        <div className="pf-body">
          <div className="pf-row">
            <TitleInput data={data} />
            <BlockedBadge data={data} />
          </div>
          {item.description.trim() && <div className="pf-desc">{item.description}</div>}
        </div>
        <AddChildButton data={data} />
      </div>
      <DepHandles topOffset={20} />
    </div>
  );
});

export const GroupNode = memo(function GroupNode({ data }: NodeProps<PlanNodeData>) {
  const { item, blocked, isLeaf } = data;
  const state = [item.done ? "is-done" : "", blocked && !item.done ? "is-blocked" : ""].join(" ");
  return (
    <div
      className={`pf-group ${state}`}
      style={{ "--item": COLOR_HEX[item.color] } as React.CSSProperties}
    >
      <div className="pf-group-header">
        <Folder size={14} className="pf-type-icon" />
        <TitleInput data={data} />
        <BlockedBadge data={data} />
        <CheckButton data={data} />
        <AddChildButton data={data} />
      </div>
      {isLeaf && <div className="pf-group-empty">Empty group — use + to add tasks</div>}
      <DepHandles topOffset={22} />
    </div>
  );
});

export const nodeTypes = {
  task: TaskNode,
  group: GroupNode,
};
