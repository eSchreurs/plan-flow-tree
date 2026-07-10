# Repository guide

PlanFlow — a standalone client-only React SPA for visual project planning. No backend;
state persists to localStorage (`planflow.v1`).

## Commands

- `bun install` — install dependencies (bun is the package manager; bun.lock)
- `bun run dev` — dev server
- `bun run build` — production build
- `bun run typecheck` — tsc, must stay clean
- `bun run lint` / `bun run format` — eslint + prettier (prettier is enforced via eslint)

There is no test framework; verify changes with `typecheck`, `build`, and by driving the
app (dev server or `vite preview`).

## Architecture

- `src/lib/` is the pure domain layer — keep it free of React/DOM except `store.ts`
  (`useSyncExternalStore`) and framework-agnostic otherwise:
  - `types.ts` — `PlanItem` hierarchy (category ⊃ requirement ⊃ phase ⊃ task, layers
    skippable, parent rank must be strictly lower), `Dependency`, `Project`.
  - `logic.ts` — `rollUpDone` (containers derive done from children — every child must be
    visited, no short-circuit), `computeBlocked` (own unmet deps OR blocked ancestor),
    `validateDep` (rejects cycles in the combined dependency + child→parent graph, which
    is what prevents deadlocks like an item depending on its own descendant).
  - `layout.ts` — deterministic auto-layout. Positions are **never stored**; they are
    recomputed from scratch after every mutation. Dependencies between siblings (lifted
    from their descendants too) create left→right columns; siblings without ordering
    stack vertically; categories are containers, other parents indent children below.
  - `store.ts` — all mutations; every project mutation passes through `withProject`,
    which clones, applies, re-rolls-up done state and bumps `updatedAt`.
- `src/components/planner/` — React Flow canvas. Nodes/edges are fully derived from the
  store each render; the only feedback accepted from React Flow is selection changes.
  Nodes are not draggable by design.

## Conventions

- Prettier: 100 cols, double quotes, trailing commas (`.prettierrc`).
- Path alias `@/` → `src/` (vite.config.ts + tsconfig paths).
- Colors: single source in `src/lib/colors.ts`, passed to nodes as the `--item` CSS
  variable; soft shades derived in CSS with `color-mix`.
