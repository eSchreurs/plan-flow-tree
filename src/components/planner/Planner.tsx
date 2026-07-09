import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  addEdge,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { MousePointer2, Link2, Trash2, Plus, Maximize2 } from "lucide-react";
import { PhaseNode, TaskNode } from "./PlannerNodes";
import { usePlannerStore, hasCycle, getBlockedStatus } from "@/lib/planner-store";
import type { DependencyEdge, ID, PlannerState } from "@/lib/planner-types";
import { PHASE_COLORS } from "@/lib/planner-types";

const nodeTypes = { phase: PhaseNode, task: TaskNode };

type Tool = "select" | "link" | "delete";

function PlannerInner() {
  const { state, setState, reset } = usePlannerStore();
  const [tool, setTool] = useState<Tool>("select");
  const rf = useReactFlow();

  // Compute code labels like 1, 1.1, 1.1.1
  const codes = useMemo(() => {
    const map = new Map<ID, string>();
    state.phases.forEach((p, i) => {
      const phaseIdx = i + 1;
      map.set(p.id, String(phaseIdx));
      const roots = state.tasks.filter((t) => t.phaseId === p.id && t.parentId === null);
      const walk = (t: any, prefix: string, idx: number) => {
        const code = `${prefix}.${idx}`;
        map.set(t.id, code);
        const kids = state.tasks.filter((c) => c.parentId === t.id);
        kids.forEach((c, ci) => walk(c, code, ci + 1));
      };
      roots.forEach((r, ri) => walk(r, String(phaseIdx), ri + 1));
    });
    return map;
  }, [state.phases, state.tasks]);

  const blocked = useMemo(() => getBlockedStatus(state), [state]);

  // Also build tree parent->child edges (visual, non-dependency) — light gray
  const treeEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    state.tasks.forEach((t) => {
      if (t.parentId) {
        edges.push({
          id: `tree_${t.id}`,
          source: t.parentId,
          target: t.id,
          sourceHandle: "child",
          targetHandle: "parent",
          type: "smoothstep",
          style: { stroke: "hsl(var(--planner-tree))", strokeWidth: 1 },
          deletable: false,
          focusable: false,
        });
      } else {
        // root task connects to phase
        edges.push({
          id: `tree_${t.id}`,
          source: t.phaseId,
          target: t.id,
          sourceHandle: "child",
          targetHandle: "parent",
          type: "smoothstep",
          style: { stroke: "hsl(var(--planner-tree))", strokeWidth: 1 },
          deletable: false,
          focusable: false,
        });
      }
    });
    return edges;
  }, [state.tasks]);

  const nodes = useMemo<Node[]>(() => {
    const list: Node[] = [];
    state.phases.forEach((p) => {
      const b = blocked.get(p.id) ?? { blocked: false, ready: false };
      list.push({
        id: p.id,
        type: "phase",
        position: state.positions[p.id] ?? { x: p.x, y: p.y },
        data: {
          title: p.title,
          color: p.color,
          done: p.done,
          blocked: b.blocked,
          ready: b.ready,
          onToggleDone: () =>
            setState((s) => {
              const ph = s.phases.find((x) => x.id === p.id)!;
              // toggle all leaf tasks under this phase
              const target = !ph.done;
              const setRec = (parentId: ID | null) => {
                const kids = s.tasks.filter((t) => t.phaseId === p.id && t.parentId === parentId);
                kids.forEach((k) => {
                  const grand = s.tasks.filter((t) => t.parentId === k.id);
                  if (grand.length === 0) k.done = target;
                  else setRec(k.id);
                });
              };
              const rootTasks = s.tasks.filter((t) => t.phaseId === p.id && t.parentId === null);
              if (rootTasks.length === 0) ph.done = target;
              else setRec(null);
              return s;
            }),
          onRename: (v: string) =>
            setState((s) => {
              const ph = s.phases.find((x) => x.id === p.id);
              if (ph) ph.title = v;
              return s;
            }),
          onDelete: () => deleteNode(p.id),
        },
      });
    });
    state.tasks.forEach((t) => {
      const b = blocked.get(t.id) ?? { blocked: false, ready: false };
      list.push({
        id: t.id,
        type: "task",
        position: state.positions[t.id] ?? { x: 0, y: 0 },
        data: {
          title: t.title,
          code: codes.get(t.id) ?? "",
          color: "",
          done: t.done,
          blocked: b.blocked,
          ready: b.ready,
          onToggleDone: () =>
            setState((s) => {
              const tt = s.tasks.find((x) => x.id === t.id)!;
              const target = !tt.done;
              const setRec = (id: ID) => {
                const kids = s.tasks.filter((c) => c.parentId === id);
                if (kids.length === 0) {
                  const node = s.tasks.find((x) => x.id === id)!;
                  node.done = target;
                } else kids.forEach((k) => setRec(k.id));
              };
              setRec(t.id);
              return s;
            }),
          onRename: (v: string) =>
            setState((s) => {
              const tt = s.tasks.find((x) => x.id === t.id);
              if (tt) tt.title = v;
              return s;
            }),
          onDelete: () => deleteNode(t.id),
          onAddChild: () => addTask(t.phaseId, t.id),
        },
      });
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, blocked, codes]);

  const depEdges = useMemo<Edge[]>(
    () =>
      state.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--planner-dep))" },
        style: { stroke: "hsl(var(--planner-dep))", strokeWidth: 1.5 },
        data: { manual: e.manual },
      })),
    [state.edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // apply position changes to store
      setState((s) => {
        changes.forEach((c) => {
          if (c.type === "position" && c.position) {
            s.positions[c.id] = c.position;
          }
        });
        return s;
      });
    },
    [setState],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setState((s) => {
        changes.forEach((c) => {
          if (c.type === "remove") {
            s.edges = s.edges.filter((e) => e.id !== c.id);
          }
        });
        return s;
      });
    },
    [setState],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      setState((s) => {
        if (hasCycle(s.edges, c.source!, c.target!)) return s;
        if (s.edges.some((e) => e.source === c.source && e.target === c.target)) return s;
        s.edges.push({
          id: `e_${Date.now()}`,
          source: c.source!,
          target: c.target!,
          manual: true,
        });
        return s;
      });
    },
    [setState],
  );

  const addPhase = () => {
    setState((s) => {
      const idx = s.phases.length;
      const id = `phase_${Date.now()}`;
      const x = idx * 280 + 40;
      s.phases.push({
        id,
        title: `Phase ${idx + 1}`,
        color: PHASE_COLORS[idx % PHASE_COLORS.length],
        done: false,
        x,
        y: 40,
      });
      s.positions[id] = { x, y: 40 };
      if (idx > 0) {
        s.edges.push({ id: `e_${Date.now()}`, source: s.phases[idx - 1].id, target: id });
      }
      return s;
    });
  };

  const addTask = (phaseId?: ID, parentId: ID | null = null) => {
    setState((s) => {
      const pid = phaseId ?? s.phases[0]?.id;
      if (!pid) return s;
      const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      s.tasks.push({ id, phaseId: pid, parentId, title: "New task", done: false });
      // position under parent or phase
      const anchor = parentId
        ? s.positions[parentId]
        : s.positions[pid];
      const siblings = s.tasks.filter(
        (t) => t.phaseId === pid && t.parentId === parentId && t.id !== id,
      );
      s.positions[id] = {
        x: (anchor?.x ?? 0) + (parentId ? 24 : 0),
        y: (anchor?.y ?? 0) + 80 + siblings.length * 80,
      };
      return s;
    });
  };

  const deleteNode = (id: ID) => {
    setState((s) => {
      // if phase, delete all its tasks
      const phase = s.phases.find((p) => p.id === id);
      if (phase) {
        const taskIds = new Set(s.tasks.filter((t) => t.phaseId === id).map((t) => t.id));
        s.tasks = s.tasks.filter((t) => t.phaseId !== id);
        s.phases = s.phases.filter((p) => p.id !== id);
        s.edges = s.edges.filter(
          (e) => e.source !== id && e.target !== id && !taskIds.has(e.source) && !taskIds.has(e.target),
        );
      } else {
        // delete task + descendants
        const toRemove = new Set<ID>([id]);
        let grew = true;
        while (grew) {
          grew = false;
          s.tasks.forEach((t) => {
            if (t.parentId && toRemove.has(t.parentId) && !toRemove.has(t.id)) {
              toRemove.add(t.id);
              grew = true;
            }
          });
        }
        s.tasks = s.tasks.filter((t) => !toRemove.has(t.id));
        s.edges = s.edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target));
      }
      return s;
    });
  };

  const onNodeClick = (_: any, node: Node) => {
    if (tool === "delete") deleteNode(node.id);
  };
  const onEdgeClick = (_: any, edge: Edge) => {
    if (tool === "delete") {
      setState((s) => {
        s.edges = s.edges.filter((e) => e.id !== edge.id);
        return s;
      });
    }
  };

  const allEdges = useMemo(() => [...treeEdges, ...depEdges], [treeEdges, depEdges]);

  return (
    <div className="planner-root">
      <header className="planner-header">
        <div className="planner-header-left">
          <input
            className="planner-project-name"
            value={state.projectName}
            onChange={(e) =>
              setState((s) => {
                s.projectName = e.target.value;
                return s;
              })
            }
          />
        </div>
      </header>
      <div className="planner-toolbar">
        <div className="planner-toolbar-group">
          <button className="planner-btn" onClick={addPhase}>
            <Plus size={14} /> Phase
          </button>
          <button className="planner-btn" onClick={() => addTask()}>
            <Plus size={14} /> Task
          </button>
          <div className="planner-divider" />
          <button
            className={`planner-icon-btn ${tool === "select" ? "is-active" : ""}`}
            onClick={() => setTool("select")}
            aria-label="Select"
          >
            <MousePointer2 size={16} />
          </button>
          <button
            className={`planner-icon-btn ${tool === "link" ? "is-active" : ""}`}
            onClick={() => setTool("link")}
            aria-label="Link"
          >
            <Link2 size={16} />
          </button>
          <button
            className={`planner-icon-btn ${tool === "delete" ? "is-active" : ""}`}
            onClick={() => setTool("delete")}
            aria-label="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="planner-toolbar-group">
          <button className="planner-btn-ghost" onClick={reset}>
            <Trash2 size={14} /> Clear all
          </button>
          <div className="planner-divider" />
          <button className="planner-icon-btn" onClick={() => rf.zoomOut()} aria-label="Zoom out">
            −
          </button>
          <span className="planner-zoom">100%</span>
          <button className="planner-icon-btn" onClick={() => rf.zoomIn()} aria-label="Zoom in">
            +
          </button>
          <button className="planner-icon-btn" onClick={() => rf.fitView({ padding: 0.2 })} aria-label="Fit">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div className="planner-canvas">
        <ReactFlow
          nodes={nodes}
          edges={allEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          nodesConnectable={tool !== "delete"}
          panOnDrag={[1, 2]}
          selectionOnDrag={false}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--planner-dot))" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function Planner() {
  return (
    <ReactFlowProvider>
      <PlannerInner />
    </ReactFlowProvider>
  );
}
