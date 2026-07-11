import { memo, useCallback, useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "reactflow";
import { Check, Lock } from "lucide-react";
import type { PlanItem } from "@/lib/types";
import { computeBlocked, itemMap } from "@/lib/logic";
import { layoutDependencyGraph } from "@/lib/graphLayout";
import { COLOR_HEX, EDGE_PENDING, EDGE_SATISFIED } from "@/lib/colors";
import { addDep } from "@/lib/store";
import type { ViewProps } from "./CanvasView";
import { toast } from "../Toast";

interface GraphNodeData {
  item: PlanItem;
  blocked: boolean;
  dimmed: boolean;
}

const GraphNode = memo(function GraphNode({ data }: NodeProps<GraphNodeData>) {
  const { item, blocked } = data;
  return (
    <div
      className={`pf-gnode ${item.done ? "is-done" : ""} ${blocked && !item.done ? "is-blocked" : ""}`}
      style={{ "--item": COLOR_HEX[item.color] } as React.CSSProperties}
    >
      {item.done ? (
        <span className="pf-check is-done is-derived">
          <Check size={11} strokeWidth={3.5} />
        </span>
      ) : blocked ? (
        <span className="pf-lock">
          <Lock size={11} />
        </span>
      ) : (
        <span className="pf-gnode-dot" />
      )}
      <span className="pf-gnode-title">{item.title || "Untitled"}</span>
      <Handle type="target" position={Position.Top} id="in" className="pf-handle" />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="pf-handle pf-handle-out"
      />
    </div>
  );
});

const graphNodeTypes = { gnode: GraphNode };

export function GraphView(props: ViewProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphInner({ project, selection, setSelection, visible, openMenu, focus }: ViewProps) {
  const reactFlow = useReactFlow();
  const byId = useMemo(() => itemMap(project.items), [project.items]);
  const blocked = useMemo(
    () => computeBlocked(project.items, project.deps),
    [project.items, project.deps],
  );
  const layout = useMemo(
    () => layoutDependencyGraph(project.items, project.deps),
    [project.items, project.deps],
  );

  const nodes = useMemo<Node<GraphNodeData>[]>(
    () =>
      layout.ids.map((id) => {
        const item = byId.get(id)!;
        const rect = layout.rects.get(id)!;
        const dimmed = visible !== null && !visible.has(id);
        return {
          id,
          type: "gnode",
          position: { x: rect.x, y: rect.y },
          style: { width: rect.w, height: rect.h },
          className: dimmed ? "pf-dim" : "",
          draggable: false,
          selected: selection?.kind === "item" && selection.id === id,
          data: { item, blocked: blocked.get(id)?.blocked ?? false, dimmed },
        };
      }),
    [layout, byId, blocked, selection, visible],
  );

  const edges = useMemo<Edge[]>(
    () =>
      project.deps.map((dep) => {
        const satisfied = byId.get(dep.source)?.done ?? false;
        const color = satisfied ? EDGE_SATISFIED : EDGE_PENDING;
        const dimmed = visible !== null && (!visible.has(dep.source) || !visible.has(dep.target));
        return {
          id: dep.id,
          source: dep.source,
          sourceHandle: "out",
          target: dep.target,
          targetHandle: "in",
          type: "smoothstep",
          pathOptions: { borderRadius: 10 },
          selected: selection?.kind === "dep" && selection.id === dep.id,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 15, height: 15 },
          style: {
            stroke: color,
            strokeWidth: 1.8,
            strokeDasharray: satisfied ? undefined : "6 4",
            opacity: dimmed ? 0.08 : 1,
          },
          interactionWidth: 14,
        } as Edge;
      }),
    [project.deps, byId, selection, visible],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const picked = changes.find((c) => c.type === "select" && c.selected);
      if (picked && picked.type === "select") {
        setSelection({ kind: "item", id: picked.id });
        return;
      }
      for (const change of changes) {
        if (change.type !== "select") continue;
        if (selection?.kind === "item" && selection.id === change.id) setSelection(null);
      }
    },
    [selection, setSelection],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const error = addDep(project.id, connection.source, connection.target);
      if (error) toast(error);
    },
    [project.id],
  );

  useEffect(() => {
    if (!focus) return;
    const rect = layout.rects.get(focus.id);
    if (rect) {
      reactFlow.setCenter(rect.x + rect.w / 2, rect.y + rect.h / 2, {
        zoom: Math.max(reactFlow.getViewport().zoom, 0.9),
        duration: 300,
      });
    }
  }, [focus, layout, reactFlow]);

  return (
    <div className="relative min-w-0 flex-1" data-testid="graph-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={graphNodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onPaneClick={() => setSelection(null)}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          openMenu({ kind: "node", x: e.clientX, y: e.clientY, itemId: node.id });
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          openMenu({ kind: "edge", x: e.clientX, y: e.clientY, depId: edge.id });
        }}
        onEdgeClick={(_, edge) => setSelection({ kind: "dep", id: edge.id })}
        nodesDraggable={false}
        nodesConnectable
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={1.75}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#dde3ea" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      {layout.ids.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-6 py-4 text-center text-[13px] text-slate-500">
            No dependencies yet — drag between the dots of two items (here or on the canvas) to
            create one.
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute right-3 bottom-3 rounded-md bg-white/80 px-2 py-1 text-[11px] text-slate-400">
        Showing only items with dependencies
      </div>
    </div>
  );
}
