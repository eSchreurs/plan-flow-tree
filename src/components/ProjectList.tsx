import { Copy, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Project } from "@/lib/types";
import { projectProgress } from "@/lib/logic";
import {
  createProject,
  deleteProject,
  duplicateProject,
  restoreDemoProjects,
  useAppState,
} from "@/lib/store";
import { navigate } from "@/lib/router";

function relativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function Logo() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
      <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
        <rect x="5" y="6" width="13" height="6" rx="2" fill="#60a5fa" />
        <rect x="10" y="14" width="13" height="6" rx="2" fill="#34d399" />
        <rect x="15" y="22" width="13" height="6" rx="2" fill="#fbbf24" />
        <path
          d="M8 12v3.5a1.5 1.5 0 0 0 1.5 1.5"
          stroke="#94a3b8"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M13 20v3.5a1.5 1.5 0 0 0 1.5 1.5"
          stroke="#94a3b8"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const [confirming, setConfirming] = useState(false);
  const progress = projectProgress(project);
  const percent = progress.total > 0 ? Math.round((100 * progress.done) / progress.total) : 0;
  const open = () => navigate({ view: "project", id: project.id });

  return (
    <div
      className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && open()}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-800">
          {project.name || "Untitled project"}
        </h2>
        <span className="shrink-0 text-[11px] text-slate-400">
          {relativeTime(project.updatedAt)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-green-500" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-[11px] font-medium text-slate-500">
          {progress.done}/{progress.total}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[12px] text-slate-400">
          {project.items.length} item{project.items.length === 1 ? "" : "s"} · {project.deps.length}{" "}
          dependenc{project.deps.length === 1 ? "y" : "ies"}
        </span>
        <div
          className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="Duplicate"
            onClick={() => duplicateProject(project.id)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            title={confirming ? "Click again to delete" : "Delete"}
            onClick={() => {
              if (confirming) deleteProject(project.id);
              else {
                setConfirming(true);
                setTimeout(() => setConfirming(false), 2500);
              }
            }}
            className={`rounded-md p-1.5 ${
              confirming
                ? "bg-red-500 text-white"
                : "text-slate-400 hover:bg-red-50 hover:text-red-500"
            }`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectList() {
  const { projects } = useAppState();
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  const handleCreate = () => {
    const id = createProject("Untitled project");
    navigate({ view: "project", id });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-[19px] font-bold text-slate-800">PlanFlow</h1>
            <p className="text-[12.5px] text-slate-500">
              Lightweight visual planning — groups, nested tasks &amp; dependencies.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-slate-700"
          >
            <Plus size={15} /> New project
          </button>
        </header>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="text-[14px] text-slate-500">No projects yet.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreate}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-slate-700"
              >
                <Plus size={15} /> New project
              </button>
              <button
                type="button"
                onClick={restoreDemoProjects}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
              >
                <Sparkles size={14} /> Load demo projects
              </button>
            </div>
          </div>
        ) : (
          <main className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </main>
        )}

        <footer className="mt-10 text-center text-[11.5px] text-slate-400">
          Everything is stored locally in your browser.
        </footer>
      </div>
    </div>
  );
}
