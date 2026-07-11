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
import { ArrowLeft, PanelLeft, Search, X } from "lucide-react";
import type { ID, ItemType, Project } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import {
  allowedChildTypes,
  canParent,
  childrenMap,
  computeBlocked,
  computeProgress,
  filterVisible,
  itemMap,
  projectProgress,
} from "@/lib/logic";
import { insertTargetAt, layoutProject } from "@/lib/layout";
import { COLOR_HEX, EDGE_PENDING, EDGE_SATISFIED } from "@/lib/colors";
import { addDep, addItem, deleteDep, renameProject, useAppState } from "@/lib/store";
import { navigate } from "@/lib/router";
import { nodeTypes, TYPE_ICON, type PlanNodeData } from "./nodes";
import { Inspector, type Selection } from "./Inspector";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { TreeDrawer } from "./TreeDrawer";
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
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<ID>>(new Set());
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
  const visible = useMemo(
    () => filterVisible(project.items, query, activeTags),
    [project.items, query, activeTags],
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
    setMenu({ kind: "edge", x: event.clientX, y: event.clientY, depId: edge.id });
  }, []);

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
      const parentRect = item.parentId ? layout.rects.get(item.parentId) : null;
      const isLeaf = (children.get(item.id) ?? []).length === 0;
      const isContainer = item.type === "group" || !isLeaf;
      const dimmed = visible !== null && !visible.has(item.id);
      return {
        id: item.id,
        type: item.type,
        position: parentRect
          ? { x: rect.x - parentRect.x, y: rect.y - parentRect.y }
          : { x: rect.x, y: rect.y },
        parentNode: item.parentId ?? undefined,
        style: { width: rect.w, height: rect.h },
        zIndex: depthOf(item.id) * 2,
        className: `${isContainer ? "pf-pass" : ""} ${dimmed ? "pf-dim" : ""}`,
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
  }, [
    project,
    layout,
    children,
    blocked,
    progress,
    selection,
    justAdded,
    visible,
    byId,
    handleAddChild,
  ]);

  // Hierarchy is containment; the only edges on the canvas are dependencies.
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
      }),
    [project.deps, byId, selection, visible],
  );

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

  const toggleTag = (tagId: ID) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const selectedItem = selection?.kind === "item" ? byId.get(selection.id) : undefined;
  const totals = projectProgress(project);
  const filterActive = visible !== null;

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
        <a
          href="#/"
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Back to projects"
        >
          <ArrowLeft size={16} />
        </a>
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100 ${
            drawerOpen ? "text-blue-600" : "text-slate-500"
          }`}
          aria-label="Toggle tree drawer"
          data-testid="drawer-toggle"
        >
          <PanelLeft size={16} />
        </button>
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
        {(["group", "task"] as ItemType[]).map((type) => {
          const Icon = TYPE_ICON[type];
          const parent = type === "task" ? resolveParent(type) : null;
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

        <div className="mx-2 h-5 w-px bg-slate-200" />

        <div className="relative">
          <Search size={13} className="absolute top-1/2 left-2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-44 rounded-lg border border-slate-200 py-1.5 pr-6 pl-7 text-[12px] outline-none focus:border-blue-400"
            aria-label="Search tasks"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100"
              aria-label="Clear search"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {project.tags.map((tag) => {
            const active = activeTags.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ kind: "tag", x: e.clientX, y: e.clientY, tagId: tag.id });
                }}
                title={`Filter by “${tag.name}” · right-click to delete the tag`}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  active ? "text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
                style={
                  active
                    ? { background: COLOR_HEX[tag.color], borderColor: COLOR_HEX[tag.color] }
                    : { borderColor: "#e2e8f0" }
                }
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: active ? "#fff" : COLOR_HEX[tag.color] }}
                />
                {tag.name}
              </button>
            );
          })}
          {filterActive && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveTags(new Set());
              }}
              className="shrink-0 text-[11.5px] text-blue-600 hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>

        <span className="ml-auto hidden shrink-0 text-[11.5px] text-slate-400 xl:block">
          Right-click anywhere to add or edit
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {drawerOpen && (
          <TreeDrawer
            project={project}
            selectedId={selection?.kind === "item" ? selection.id : null}
            visible={visible}
            onSelect={(id) => {
              setSelection({ kind: "item", id });
              centerOnItem(id);
            }}
          />
        )}
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
                Empty project — right-click the canvas or use the buttons above to add a group or
                task.
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
