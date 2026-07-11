import { memo, useCallback, useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "reactflow";
import type { PlanItem } from "@/lib/types";
import { itemMap } from "@/lib/logic";
import { layoutMindMap, MIND_CENTER_H, MIND_CENTER_W } from "@/lib/mindLayout";
import { COLOR_HEX } from "@/lib/colors";
import type { ViewProps } from "./CanvasView";

const CENTER_ID = "__center__";

interface MindNodeData {
  item: PlanItem;
  color: string;
  side: 1 | -1;
}

const MindNode = memo(function MindNode({ data }: NodeProps<MindNodeData>) {
  const { item, color } = data;
  return (
    <div
      className={`pf-mind ${item.done ? "is-done" : ""} ${item.type === "group" ? "is-group" : ""}`}
      style={{ "--item": color } as React.CSSProperties}
    >
      <span className="pf-mind-dot" />
      <span className="pf-mind-title">{item.title || "Untitled"}</span>
      <Handle type="target" position={Position.Left} id="in-l" className="pf-handle-hidden" />
      <Handle type="target" position={Position.Right} id="in-r" className="pf-handle-hidden" />
      <Handle type="source" position={Position.Left} id="out-l" className="pf-handle-hidden" />
      <Handle type="source" position={Position.Right} id="out-r" className="pf-handle-hidden" />
    </div>
  );
});

const MindCenter = memo(function MindCenter({ data }: NodeProps<{ title: string }>) {
  return (
    <div className="pf-mind-center">
      {data.title || "Untitled project"}
      <Handle type="source" position={Position.Left} id="out-l" className="pf-handle-hidden" />
      <Handle type="source" position={Position.Right} id="out-r" className="pf-handle-hidden" />
    </div>
  );
});

const mindNodeTypes = { mind: MindNode, mindCenter: MindCenter };

export function MindMapView(props: ViewProps) {
  return (
    <ReactFlowProvider>
      <MindMapInner {...props} />
    </ReactFlowProvider>
  );
}

function MindMapInner({ project, selection, setSelection, visible, openMenu, focus }: ViewProps) {
  const reactFlow = useReactFlow();
  const byId = useMemo(() => itemMap(project.items), [project.items]);
  const layout = useMemo(() => layoutMindMap(project.items), [project.items]);

  const branchColor = useCallback(
    (id: string): string => {
      const rootId = layout.branchRoot.get(id);
      const root = rootId ? byId.get(rootId) : undefined;
      const item = byId.get(id);
      const key = item && item.color !== "slate" ? item.color : (root?.color ?? "slate");
      return COLOR_HEX[key === "slate" ? "blue" : key];
    },
    [layout.branchRoot, byId],
  );

  const nodes = useMemo<Node[]>(() => {
    const list: Node[] = [
      {
        id: CENTER_ID,
        type: "mindCenter",
        position: { x: layout.centerRect.x, y: layout.centerRect.y },
        style: { width: MIND_CENTER_W, height: MIND_CENTER_H },
        draggable: false,
        selectable: false,
        data: { title: project.name },
      },
    ];
    for (const item of project.items) {
      const rect = layout.rects.get(item.id);
      if (!rect) continue;
      const dimmed = visible !== null && !visible.has(item.id);
      list.push({
        id: item.id,
        type: "mind",
        position: { x: rect.x, y: rect.y },
        style: { width: rect.w, height: rect.h },
        className: dimmed ? "pf-dim" : "",
        draggable: false,
        selected: selection?.kind === "item" && selection.id === item.id,
        data: { item, color: branchColor(item.id), side: layout.side.get(item.id) ?? 1 },
      });
    }
    return list;
  }, [project, layout, selection, visible, branchColor]);

  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = [];
    for (const item of project.items) {
      const rect = layout.rects.get(item.id);
      if (!rect) continue;
      const side = layout.side.get(item.id) ?? 1;
      const parentIsItem = item.parentId && layout.rects.has(item.parentId);
      const source = parentIsItem ? item.parentId! : CENTER_ID;
      const dimmed = visible !== null && !visible.has(item.id);
      list.push({
        id: `mind-${item.id}`,
        source,
        sourceHandle: side === 1 ? "out-r" : "out-l",
        target: item.id,
        targetHandle: side === 1 ? "in-l" : "in-r",
        type: "default",
        style: { stroke: branchColor(item.id), strokeWidth: 1.8, opacity: dimmed ? 0.08 : 0.85 },
        focusable: false,
      } as Edge);
    }
    return list;
  }, [project.items, layout, visible, branchColor]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const picked = changes.find((c) => c.type === "select" && c.selected && c.id !== CENTER_ID);
      if (picked && picked.type === "select") {
        setSelection({ kind: "item", id: picked.id });
        return;
      }
      for (const change of changes) {
        if (change.type !== "select" || change.id === CENTER_ID) continue;
        if (selection?.kind === "item" && selection.id === change.id) setSelection(null);
      }
    },
    [selection, setSelection],
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
    <div className="relative min-w-0 flex-1" data-testid="mind-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={mindNodeTypes}
        onNodesChange={onNodesChange}
        onPaneClick={() => setSelection(null)}
        onNodeContextMenu={(e, node) => {
          if (node.id === CENTER_ID) return;
          e.preventDefault();
          openMenu({ kind: "node", x: e.clientX, y: e.clientY, itemId: node.id });
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={1.75}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#e5eaf0" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      {project.items.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-6 py-4 text-center text-[13px] text-slate-500">
            Nothing to map yet — add groups and tasks first.
          </div>
        </div>
      )}
    </div>
  );
}
