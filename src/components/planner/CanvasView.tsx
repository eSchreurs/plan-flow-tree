import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import type { ID, ItemType, Project } from "@/lib/types";
import {
  allowedChildTypes,
  childrenMap,
  computeBlocked,
  computeProgress,
  itemMap,
} from "@/lib/logic";
import { insertTargetAt, layoutProject } from "@/lib/layout";
import { COLOR_HEX, EDGE_PENDING, EDGE_SATISFIED, EDGE_TREE } from "@/lib/colors";
import { addDep } from "@/lib/store";
import { nodeTypes, type PlanNodeData } from "./nodes";
import type { Selection } from "./Inspector";
import type { MenuState } from "./ContextMenu";
import { toast } from "../Toast";

export interface ViewProps {
  project: Project;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  visible: Set<ID> | null;
  openMenu: (menu: MenuState) => void;
  onAdd: (parentId: ID | null, type: ItemType, order?: number) => void;
  justAdded: ID | null;
  /** Bumped by the drawer to ask the active view to bring an item into view. */
  focus: { id: ID; n: number } | null;
}

export function CanvasView(props: ViewProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  project,
  selection,
  setSelection,
  visible,
  openMenu,
  onAdd,
  justAdded,
  focus,
}: ViewProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const reactFlow = useReactFlow();

  const byId = useMemo(() => itemMap(project.items), [project.items]);
  const children = useMemo(() => childrenMap(project.items), [project.items]);
  const blocked = useMemo(
    () => computeBlocked(project.items, project.deps),
    [project.items, project.deps],
  );
  const progress = useMemo(() => computeProgress(project.items), [project.items]);
  const layout = useMemo(
    () => layoutProject(project.items, project.deps),
    [project.items, project.deps],
  );

  // ---- right-click context menus ----
  const openPaneMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const point = reactFlow.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      const target = insertTargetAt(project.items, layout, point);
      openMenu({ kind: "pane", x: event.clientX, y: event.clientY, ...target });
    },
    [project.items, layout, reactFlow, openMenu],
  );

  const openNodeMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      openMenu({ kind: "node", x: event.clientX, y: event.clientY, itemId: node.id });
    },
    [openMenu],
  );

  const openEdgeMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      if (edge.id.startsWith("tree-")) return; // branch connectors are not editable
      openMenu({ kind: "edge", x: event.clientX, y: event.clientY, depId: edge.id });
    },
    [openMenu],
  );

  const nodes = useMemo<Node<PlanNodeData>[]>(() => {
    // React Flow requires parents to appear before their children.
    const depthOf = (id: ID): number => {
      let depth = 0;
      let current = byId.get(id);
      while (current?.parentId) {
        depth++;
        current = byId.get(current.parentId);
      }
      return depth;
    };
    const ordered = [...project.items].sort((a, b) => depthOf(a.id) - depthOf(b.id));
    return ordered.map((item) => {
      const rect = layout.rects.get(item.id) ?? { x: 0, y: 0, w: 240, h: 46 };
      const container = layout.containerOf.get(item.id) ?? null;
      const containerRect = container ? layout.rects.get(container) : null;
      const isLeaf = (children.get(item.id) ?? []).length === 0;
      const isContainer = layout.containers.has(item.id);
      const dimmed = visible !== null && !visible.has(item.id);
      return {
        id: item.id,
        type: item.type,
        position: containerRect
          ? { x: rect.x - containerRect.x, y: rect.y - containerRect.y }
          : { x: rect.x, y: rect.y },
        parentNode: container ?? undefined,
        style: { width: rect.w, height: rect.h },
        // Tiers: group boxes (0) → task boxes (1) → branch edges (2) → cards (3).
        zIndex: isContainer ? (item.type === "group" ? 0 : 1) : 3,
        className: `${isContainer ? "pf-pass" : ""} ${dimmed ? "pf-dim" : ""}`,
        draggable: false,
        selected: selection?.kind === "item" && selection.id === item.id,
        data: {
          projectId: project.id,
          item,
          isLeaf,
          isContainer,
          blocked: blocked.get(item.id)?.blocked ?? false,
          progress: isLeaf ? null : (progress.get(item.id) ?? null),
          childTypes: allowedChildTypes(item.type),
          autoFocus: item.id === justAdded,
          onAddChild: (type: ItemType) => onAdd(item.id, type),
        },
      };
    });
  }, [project, layout, children, blocked, progress, selection, justAdded, visible, byId, onAdd]);

  // Boxes show containment directly; deep parent tasks connect to their
  // subtasks with branch lines. Dependencies are the arrows.
  const edges = useMemo<Edge[]>(() => {
    const treeEdges: Edge[] = [];
    for (const item of project.items) {
      if (!item.parentId) continue;
      const parent = byId.get(item.parentId);
      if (!parent || layout.containers.has(parent.id)) continue; // boxes wrap visually
      const dimmed = visible !== null && !visible.has(item.id);
      treeEdges.push({
        id: `tree-${item.id}`,
        source: parent.id,
        sourceHandle: "tree",
        target: item.id,
        targetHandle: "in",
        type: "smoothstep",
        pathOptions: { borderRadius: 8 },
        style: { stroke: EDGE_TREE, strokeWidth: 1.6, opacity: dimmed ? 0.08 : 1 },
        selectable: false,
        focusable: false,
        zIndex: 2,
      } as Edge);
    }
    const depEdges = project.deps.map((dep) => {
      const satisfied = byId.get(dep.source)?.done ?? false;
      const color = satisfied ? EDGE_SATISFIED : EDGE_PENDING;
      const dimmed = visible !== null && (!visible.has(dep.source) || !visible.has(dep.target));
      return {
        id: dep.id,
        source: dep.source,
        sourceHandle: "out",
        target: dep.target,
        targetHandle: "in",
        type: "default",
        selected: selection?.kind === "dep" && selection.id === dep.id,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 15, height: 15 },
        style: {
          stroke: color,
          strokeWidth: 1.8,
          strokeDasharray: satisfied ? undefined : "6 4",
          opacity: dimmed ? 0.08 : 1,
        },
        interactionWidth: 14,
        zIndex: 1000,
      };
    });
    return [...treeEdges, ...depEdges];
  }, [project.items, project.deps, byId, layout.containers, selection, visible]);

  // Nodes/edges are fully derived from the store; the only changes we accept
  // back from React Flow are selection updates.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // A new selection wins over deselects of the previous one — React Flow
      // emits both in node-array order, not click order.
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

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const picked = changes.find((c) => c.type === "select" && c.selected);
      if (picked && picked.type === "select") {
        setSelection({ kind: "dep", id: picked.id });
        return;
      }
      for (const change of changes) {
        if (change.type !== "select") continue;
        if (selection?.kind === "dep" && selection.id === change.id) setSelection(null);
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

  const centerOnItem = useCallback(
    (id: ID, duration = 300) => {
      const rect = layout.rects.get(id);
      if (!rect) return;
      reactFlow.setCenter(rect.x + rect.w / 2, rect.y + rect.h / 2, {
        zoom: reactFlow.getViewport().zoom,
        duration,
      });
    },
    [layout, reactFlow],
  );

  // Drawer navigation: bring the requested item into view.
  useEffect(() => {
    if (focus) centerOnItem(focus.id);
  }, [focus, centerOnItem]);

  // Pan to a freshly added node when it lands outside the current viewport.
  useEffect(() => {
    if (!justAdded) return;
    const rect = layout.rects.get(justAdded);
    const container = canvasRef.current;
    if (!rect || !container) return;
    const { x, y, zoom } = reactFlow.getViewport();
    const cx = (rect.x + rect.w / 2) * zoom + x;
    const cy = (rect.y + rect.h / 2) * zoom + y;
    const bounds = container.getBoundingClientRect();
    const margin = 40;
    const inView =
      cx > margin && cy > margin && cx < bounds.width - margin && cy < bounds.height - margin;
    if (!inView) centerOnItem(justAdded, 350);
  }, [justAdded, layout, reactFlow, centerOnItem]);

  return (
    <div ref={canvasRef} className="relative min-w-0 flex-1" data-testid="canvas-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => setSelection(null)}
        onPaneContextMenu={openPaneMenu}
        onNodeContextMenu={openNodeMenu}
        onEdgeContextMenu={openEdgeMenu}
        nodesDraggable={false}
        nodesConnectable
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={1.75}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#dde3ea" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node) => COLOR_HEX[(node.data as PlanNodeData).item.color]}
          nodeStrokeWidth={0}
          maskColor="rgb(241 245 249 / 0.7)"
        />
      </ReactFlow>
      {project.items.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-6 py-4 text-center text-[13px] text-slate-500">
            Empty project — right-click the canvas or use the buttons above to add a group or task.
          </div>
        </div>
      )}
    </div>
  );
}
