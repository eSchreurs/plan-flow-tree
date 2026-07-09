import { Handle, Position, type NodeProps } from "reactflow";
import { Check, Plus, Trash2 } from "lucide-react";

export interface PhaseNodeData {
  title: string;
  color: string;
  done: boolean;
  blocked: boolean;
  ready: boolean;
  onToggleDone: () => void;
  onRename: (v: string) => void;
  onDelete: () => void;
}

export function PhaseNode({ data, selected }: NodeProps<PhaseNodeData>) {
  return (
    <div
      className={`planner-phase ${data.blocked ? "is-blocked" : ""} ${data.ready ? "is-ready" : ""} ${selected ? "is-selected" : ""}`}
      style={{ ["--phase-color" as any]: `var(--${data.color})` }}
    >
      <button
        type="button"
        className="planner-check"
        onClick={data.onToggleDone}
        aria-label="Toggle done"
      >
        {data.done && <Check size={12} strokeWidth={3} />}
      </button>
      <input
        className="planner-title"
        value={data.title}
        onChange={(e) => data.onRename(e.target.value)}
      />
      <button
        type="button"
        className="planner-trash"
        onClick={data.onDelete}
        aria-label="Delete"
      >
        <Trash2 size={14} />
      </button>
      <Handle type="target" position={Position.Left} className="planner-handle" />
      <Handle type="source" position={Position.Right} className="planner-handle planner-handle-source" />
      <Handle type="source" position={Position.Bottom} id="child" className="planner-handle-hidden" />
    </div>
  );
}

export interface TaskNodeData extends PhaseNodeData {
  code: string;
  onAddChild: () => void;
}

export function TaskNode({ data, selected }: NodeProps<TaskNodeData>) {
  return (
    <div
      className={`planner-task ${data.done ? "is-done" : ""} ${data.blocked ? "is-blocked" : ""} ${data.ready ? "is-ready" : ""} ${selected ? "is-selected" : ""}`}
    >
      <button
        type="button"
        className="planner-check"
        onClick={data.onToggleDone}
        aria-label="Toggle done"
      >
        {data.done && <Check size={12} strokeWidth={3} />}
      </button>
      <span className="planner-code">{data.code}</span>
      <input
        className="planner-title"
        value={data.title}
        onChange={(e) => data.onRename(e.target.value)}
      />
      <button
        type="button"
        className="planner-trash"
        onClick={data.onDelete}
        aria-label="Delete"
      >
        <Trash2 size={14} />
      </button>
      <button
        type="button"
        className="planner-add-child nodrag"
        onClick={data.onAddChild}
        aria-label="Add subtask"
      >
        <Plus size={12} strokeWidth={3} />
      </button>
      <Handle type="target" position={Position.Left} className="planner-handle" />
      <Handle type="source" position={Position.Right} id="dep" className="planner-handle planner-handle-source" />
      <Handle type="target" position={Position.Top} id="parent" className="planner-handle-hidden" />
      <Handle type="source" position={Position.Bottom} id="child" className="planner-handle-hidden" />
    </div>
  );
}
