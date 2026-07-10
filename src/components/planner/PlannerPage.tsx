import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ArrowLeft, X } from "lucide-react";
import type { ID, ItemType, Project } from "@/lib/types";
import { ITEM_TYPES, TYPE_LABEL } from "@/lib/types";
import {
  allowedChildTypes,
  canParent,
  childrenMap,
  computeBlocked,
  computeProgress,
  itemMap,
  projectProgress,
} from "@/lib/logic";
import { insertTargetAt, layoutProject } from "@/lib/layout";
import { COLOR_HEX, EDGE_PENDING, EDGE_SATISFIED, EDGE_TREE } from "@/lib/colors";
import { addDep, addItem, deleteDep, renameProject, useAppState } from "@/lib/store";
import { navigate } from "@/lib/router";
import { nodeTypes, TYPE_ICON, type PlanNodeData } from "./nodes";
import { Inspector, type Selection } from "./Inspector";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { toast } from "../Toast";

export function PlannerPage({ projectId }: { projectId: ID }) {
  const { projects } = useAppState();
  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!project) navigate({ view: "home" });
  }, [project]);

  if (!project) return null;
  return (
    <ReactFlowProvider>
      <PlannerInner key={project.id} project={project} />
    </ReactFlowProvider>
  );
}

function PlannerInner({ project }: { project: Project }) {
  const [selection, setSelection] = useState<Selection>(null);
  const [justAdded, setJustAdded] = useState<ID | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
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

  const handleAddChild = useCallback(
    (parentId: ID | null, type: ItemType, order?: number) => {
      const id = addItem(project.id, type, parentId, { order });
      setSelection({ kind: "item", id });
      setJustAdded(id);
    },
    [project.id],
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
      setMenu({ kind: "pane", x: event.clientX, y: event.clientY, ...target });
    },
    [project.items, layout, reactFlow],
  );

  const openNodeMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setMenu({ kind: "node", x: event.clientX, y: event.clientY, itemId: node.id });
  }, []);

  const openEdgeMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    if (edge.id.startsWith("tree-")) return; // hierarchy connectors are not editable
    setMenu({ kind: "edge", x: event.clientX, y: event.clientY, depId: edge.id });
  }, []);

  const nodes = useMemo<Node<PlanNodeData>[]>(() => {
    const ordered = [...project.items].sort(
      (a, b) => (a.type === "category" ? 0 : 1) - (b.type === "category" ? 0 : 1),
    );
    return ordered.map((item) => {
      const rect = layout.rects.get(item.id) ?? { x: 0, y: 0, w: 240, h: 46 };
      const container = layout.containerOf.get(item.id) ?? null;
      const containerRect = container ? layout.rects.get(container) : null;
      const isLeaf = (children.get(item.id) ?? []).length === 0;
      return {
        id: item.id,
        type: item.type,
        position: containerRect
          ? { x: rect.x - containerRect.x, y: rect.y - containerRect.y }
          : { x: rect.x, y: rect.y },
        parentNode: container ?? undefined,
        style: { width: rect.w, height: rect.h },
        zIndex: item.type === "category" ? 0 : 2,
        draggable: false,
        selected: selection?.kind === "item" && selection.id === item.id,
        data: {
          projectId: project.id,
          item,
          isLeaf,
          blocked: blocked.get(item.id)?.blocked ?? false,
          progress: isLeaf ? null : (progress.get(item.id) ?? null),
          childTypes: allowedChildTypes(item.type),
          autoFocus: item.id === justAdded,
          onAddChild: (type: ItemType) => handleAddChild(item.id, type),
        },
      };
    });
  }, [project, layout, children, blocked, progress, selection, justAdded, handleAddChild]);

  const edges = useMemo<Edge[]>(() => {
    const treeEdges: Edge[] = [];
    for (const item of project.items) {
      if (!item.parentId) continue;
      const parent = byId.get(item.parentId);
      if (!parent || parent.type === "category") continue; // containment is visual
      treeEdges.push({
        id: `tree-${item.id}`,
        source: parent.id,
        sourceHandle: "tree",
        target: item.id,
        targetHandle: "in",
        type: "smoothstep",
        pathOptions: { borderRadius: 10 },
        style: { stroke: EDGE_TREE, strokeWidth: 1.6 },
        selectable: false,
        focusable: false,
        zIndex: 1,
      } as Edge);
    }
    const depEdges = project.deps.map((dep) => {
      const satisfied = byId.get(dep.source)?.done ?? false;
      const color = satisfied ? EDGE_SATISFIED : EDGE_PENDING;
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
        },
        interactionWidth: 14,
        zIndex: 1,
      };
    });
    return [...treeEdges, ...depEdges];
  }, [project.items, project.deps, byId, selection]);

  // Nodes/edges are fully derived from the store; the only changes we accept
  // back from React Flow are selection updates.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type !== "select") continue;
      setSelection((current) =>
        change.selected
          ? { kind: "item", id: change.id }
          : current?.kind === "item" && current.id === change.id
            ? null
            : current,
      );
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const change of changes) {
      if (change.type !== "select") continue;
      setSelection((current) =>
        change.selected
          ? { kind: "dep", id: change.id }
          : current?.kind === "dep" && current.id === change.id
            ? null
            : current,
      );
    }
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const error = addDep(project.id, connection.source, connection.target);
      if (error) toast(error);
    },
    [project.id],
  );

  // Delete selected dependency with the keyboard; Escape closes the context
  // menu first, then clears the selection.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key === "Escape") {
        if (menu) setMenu(null);
        else setSelection(null);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selection?.kind === "dep") {
        deleteDep(project.id, selection.id);
        setSelection(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selection, menu, project.id]);

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
    const visible =
      cx > margin && cy > margin && cx < bounds.width - margin && cy < bounds.height - margin;
    if (!visible) {
      reactFlow.setCenter(rect.x + rect.w / 2, rect.y + rect.h / 2, { zoom, duration: 350 });
    }
  }, [justAdded, layout, reactFlow]);

  /** Where a toolbar-add of `type` would land, based on the selection. */
  const resolveParent = (type: ItemType): ID | null => {
    if (selection?.kind !== "item") return null;
    let current = byId.get(selection.id);
    while (current) {
      if (canParent(current.type, type)) return current.id;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return null;
  };

  const selectedItem = selection?.kind === "item" ? byId.get(selection.id) : undefined;
  const totals = projectProgress(project);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <a
          href="#/"
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Back to projects"
        >
          <ArrowLeft size={16} />
        </a>
        <input
          className="w-64 rounded-md px-2 py-1 text-[15px] font-semibold text-slate-800 outline-none hover:bg-slate-100 focus:bg-slate-100"
          value={project.name}
          onChange={(e) => renameProject(project.id, e.target.value)}
          aria-label="Project name"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-medium text-slate-500">
            {totals.done}/{totals.total} done
          </span>
        </div>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
        <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Add
        </span>
        {ITEM_TYPES.map((type) => {
          const Icon = TYPE_ICON[type];
          const parent = resolveParent(type);
          const parentTitle = parent ? byId.get(parent)?.title : null;
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleAddChild(parent, type)}
              title={
                parentTitle
                  ? `Add ${TYPE_LABEL[type]} inside “${parentTitle}”`
                  : `Add ${TYPE_LABEL[type]}`
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              <Icon size={13} className="text-slate-500" />
              {TYPE_LABEL[type]}
            </button>
          );
        })}
        {selectedItem && (
          <span className="flex items-center gap-1.5 rounded-full bg-blue-50 py-1 pr-1 pl-2.5 text-[11.5px] font-medium text-blue-700">
            into: {selectedItem.title || TYPE_LABEL[selectedItem.type]}
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="rounded-full p-0.5 hover:bg-blue-100"
              aria-label="Clear selection"
            >
              <X size={11} />
            </button>
          </span>
        )}
        <span className="ml-auto hidden text-[11.5px] text-slate-400 md:block">
          Right-click anywhere to add or edit · drag from a right dot to link a dependency
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={canvasRef} className="relative min-w-0 flex-1">
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
                Empty project — add a category, phase or task with the buttons above.
              </div>
            </div>
          )}
        </div>
        <Inspector
          project={project}
          selection={selection}
          onClose={() => setSelection(null)}
          onAddChild={(parentId, type) => handleAddChild(parentId, type)}
          onSelect={setSelection}
        />
      </div>
      {menu && (
        <ContextMenu
          menu={menu}
          project={project}
          onAdd={handleAddChild}
          onSelect={setSelection}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
