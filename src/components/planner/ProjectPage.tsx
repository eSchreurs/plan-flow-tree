import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarRange,
  GitBranch,
  Network,
  PanelLeft,
  Search,
  Workflow,
  X,
} from "lucide-react";
import type { ID, ItemType, Project } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import { canParent, filterVisible, itemMap, projectProgress } from "@/lib/logic";
import { COLOR_HEX } from "@/lib/colors";
import { addItem, deleteDep, renameProject, useAppState } from "@/lib/store";
import { navigate, type ProjectView } from "@/lib/router";
import { TYPE_ICON } from "./nodes";
import { Inspector, type Selection } from "./Inspector";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { TreeDrawer } from "./TreeDrawer";
import { CanvasView } from "./CanvasView";
import { GraphView } from "./GraphView";
import { TimelineView } from "./TimelineView";
import { MindMapView } from "./MindMapView";

const VIEWS: { key: ProjectView; label: string; icon: typeof Workflow; hint: string }[] = [
  {
    key: "canvas",
    label: "Canvas",
    icon: Workflow,
    hint: "Right-click anywhere to add or edit",
  },
  {
    key: "graph",
    label: "Graph",
    icon: GitBranch,
    hint: "Dependencies only — drag between dots to link",
  },
  {
    key: "timeline",
    label: "Timeline",
    icon: CalendarRange,
    hint: "Drag bars to reschedule · faded bars are auto-planned",
  },
  { key: "map", label: "Mind map", icon: Network, hint: "Right-click a node to grow the tree" },
];

export function ProjectPage({ projectId, view }: { projectId: ID; view: ProjectView }) {
  const { projects } = useAppState();
  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!project) navigate({ view: "home" });
  }, [project]);

  if (!project) return null;
  return <ProjectInner key={project.id} project={project} view={view} />;
}

function ProjectInner({ project, view }: { project: Project; view: ProjectView }) {
  const [selection, setSelection] = useState<Selection>(null);
  const [justAdded, setJustAdded] = useState<ID | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<ID>>(new Set());
  const [focus, setFocus] = useState<{ id: ID; n: number } | null>(null);

  const byId = useMemo(() => itemMap(project.items), [project.items]);
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
  const viewMeta = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  const viewProps = {
    project,
    selection,
    setSelection,
    visible,
    openMenu: setMenu,
    onAdd: handleAddChild,
    justAdded,
    focus,
  };

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
          className="w-52 rounded-md px-2 py-1 text-[15px] font-semibold text-slate-800 outline-none hover:bg-slate-100 focus:bg-slate-100"
          value={project.name}
          onChange={(e) => renameProject(project.id, e.target.value)}
          aria-label="Project name"
        />

        <nav className="mx-auto flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = v.key === view;
            return (
              <button
                key={v.key}
                type="button"
                data-testid={`view-tab-${v.key}`}
                onClick={() => navigate({ view: "project", id: project.id, sub: v.key })}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  active
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon size={13} />
                {v.label}
              </button>
            );
          })}
        </nav>

        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-medium text-slate-500">
          {totals.done}/{totals.total} done
        </span>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
        {view === "canvas" && (
          <>
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
          </>
        )}

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
          {viewMeta.hint}
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
              setFocus((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
            }}
          />
        )}
        {view === "canvas" && <CanvasView {...viewProps} />}
        {view === "graph" && <GraphView {...viewProps} />}
        {view === "timeline" && <TimelineView {...viewProps} />}
        {view === "map" && <MindMapView {...viewProps} />}
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
