# PlanFlow

A lightweight, fast, standalone visual planning tool. Plan projects as a hierarchy of
**Categories ⊃ Requirements ⊃ Phases ⊃ Tasks** on an infinite canvas that automatically
keeps itself tidy.

No backend, no accounts — everything lives in your browser's localStorage. Demo projects
are seeded on first launch.

## Features

- **Projects** — create, rename, duplicate and delete projects from the home screen; each
  project gets its own canvas.
- **Optional hierarchy** — every layer can be skipped: tasks can live directly under a
  category, at the root, wherever they make sense. The only rule is that a parent must be
  a higher layer than its child.
- **Done roll-up** — tasks (and other childless items) are checked off manually; anything
  with children derives its state: all tasks done → phase done, all phases done →
  requirement done, all requirements done → category done.
- **Dependencies** — drag from an item's right dot to another item to say "this must
  finish first". Works between any two items: task → task, phase → phase, requirement →
  phase, category → task, you name it.
- **Blocking** — an item with an unfinished dependency is greyed out and can't be
  completed, and neither can anything inside it (a task in phase 2 waits for phase 1).
  Dependency arrows are dashed amber while waiting and solid grey once satisfied.
  Dependencies that would deadlock (directly or through the hierarchy) are rejected.
- **Auto-layout** — every add/remove/change re-resolves the canvas into a clean
  hierarchic overview: dependency chains flow left → right like a timeline, independent
  siblings stack vertically, categories are containers, requirements are header cards,
  phases are colored pills and tasks are checkable cards. No overlaps, no manual tidying.
- **Per-item styling** — title, description and a color for every item via the inspector
  panel.

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
- **GitHub Pages (manual trigger)** — `.github/workflows/deploy-pages.yml` publishes to
  `https://<owner>.github.io/plan-flow-tree/`. Run it from the Actions tab. Note: on a
  free GitHub plan Pages requires the repository to be public.

## Stack

- [React 19](https://react.dev) + [Vite](https://vite.dev) — plain SPA, no SSR
- [React Flow 11](https://reactflow.dev) — canvas, nodes, edges
- [Tailwind CSS 4](https://tailwindcss.com) — chrome/UI styling
- [lucide-react](https://lucide.dev) — icons
- TypeScript, ESLint, Prettier

## How it's put together

| Path                             | Purpose                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `src/lib/types.ts`               | Data model: projects, items, dependencies, hierarchy ranks, colors |
| `src/lib/logic.ts`               | Done roll-up, blocked computation, deadlock-safe dependency checks |
| `src/lib/layout.ts`              | Deterministic auto-layout (dependency layers × sibling stacks)     |
| `src/lib/store.ts`               | localStorage-backed store + all mutations                          |
| `src/lib/seed.ts`                | Demo projects                                                      |
| `src/components/planner/`        | Canvas page, node renderers, inspector panel                       |
| `src/components/ProjectList.tsx` | Home screen                                                        |

State is a single source of truth: node positions are never stored — the layout engine
recomputes them from the hierarchy + dependencies on every change, which is what keeps
the canvas permanently organized.
