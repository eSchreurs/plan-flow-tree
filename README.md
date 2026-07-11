# PlanFlow

A lightweight, fast, standalone visual planning tool. Plan projects as **Groups of
nested Tasks** on an infinite canvas that automatically keeps itself tidy.

No backend, no accounts — everything lives in your browser's localStorage. Demo projects
are seeded on first launch.

## The model

Two concepts, kept deliberately separate:

- **Hierarchy is vertical containment.** A _Group_ is a top-level container. Inside it,
  everything is a _Task_, and any task can hold unlimited child tasks — a task with
  children becomes a parent/header whose subtasks live underneath it, indented, inside
  the same visual box. Tasks can also live directly at the root.
- **Flow is horizontal dependencies.** Drag from an item's right dot to another item to
  say "this must finish first". When B depends on A, B is placed in a column to the
  right of A and connected with a directional arrow — at every nesting level.

Plus **tags**: simple colored labels (not containers) used purely for filtering and
search.

## Features

- **Projects** — create, rename, duplicate and delete from the home screen.
- **Done roll-up** — leaf tasks are checked off manually; anything with children derives
  its state (all subtasks done → parent done → group done) and shows progress.
- **Blocking** — an item with an unfinished dependency is greyed out and can't be
  completed, and neither can anything inside it. Pending dependency arrows are dashed
  amber, satisfied ones solid grey. Dependencies that would deadlock (directly or
  through the hierarchy) are rejected with an explanation.
- **Auto-layout** — every change re-resolves the canvas: dependency chains flow left →
  right like a timeline, independent siblings stack vertically, parents wrap their
  children. Positions are never stored; no overlaps, no manual tidying.
- **Right-click everything** — right-click inside a group/task to add there, in the gap
  between two items to insert exactly there, on empty canvas for root items, on a node
  for siblings/duplicate/done/delete, on a dependency arrow to remove it, on a tag chip
  to delete the tag. Enter confirms the highlighted entry, Esc cancels.
- **Tree drawer** — collapsible outline of the whole project for fast navigation
  (click to jump), expand/collapse, and **drag-and-drop reparenting** (drop a task onto
  a group, another task, or the project row to move it).
- **Tags & search** — filter chips and a search box dim everything that doesn't match.
- **Per-item styling** — title, description and color via the inspector panel.

## Getting started

```sh
bun install
bun run dev       # start the dev server
```

Other scripts:

```sh
bun run build      # production build (dist/)
bun run preview    # serve the production build
bun run typecheck  # tsc --noEmit
bun run lint       # eslint
bun run format     # prettier --write
```

npm/pnpm work too if you prefer them over bun.

## Deploying

The build is fully static (`dist/`) with **relative asset paths and hash routing**, so it
runs from any URL — a domain root, a subfolder, or GitHub Pages — with no server config.

- **Hostinger (automated)** — `.github/workflows/deploy-hostinger.yml` builds on every
  push to `main` and deploys `dist/` over FTPS. One-time setup: add
  `HOSTINGER_FTP_SERVER`, `HOSTINGER_FTP_USERNAME` and `HOSTINGER_FTP_PASSWORD` as
  repository secrets (credentials from hPanel → Files → FTP Accounts) and adjust
  `server-dir` in the workflow if you don't want it under `public_html/planflow/`.
  Until the secrets exist the deploy step is skipped, but every run still uploads a
  `dist` artifact you can download and drop into Hostinger's File Manager by hand.
- **GitHub Pages (automated)** — `.github/workflows/deploy-pages.yml` publishes to
  `https://<owner>.github.io/plan-flow-tree/` on every push to `main` (or manually from
  the Actions tab). One-time setup: Settings → Pages → "Build and deployment" → Source:
  **GitHub Actions**. Note: on a free GitHub plan Pages requires a public repository.

## How it's put together

| Path                             | Purpose                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/types.ts`               | Data model: projects, groups/tasks, dependencies, tags, colors         |
| `src/lib/logic.ts`               | Done roll-up, blocking, deadlock-safe dependency & move validation     |
| `src/lib/layout.ts`              | Deterministic auto-layout + right-click hit-testing                    |
| `src/lib/store.ts`               | localStorage-backed store (`planflow.v2`) + all mutations              |
| `src/lib/migrate.ts`             | v1 → v2 migration (requirements→groups, phases→tasks, categories→tags) |
| `src/lib/seed.ts`                | Demo projects                                                          |
| `src/components/planner/`        | Canvas, node renderers, context menu, tree drawer, inspector           |
| `src/components/ProjectList.tsx` | Home screen                                                            |

State is a single source of truth: node positions are never stored — the layout engine
recomputes them from the hierarchy + dependencies on every change, which is what keeps
the canvas permanently organized.
