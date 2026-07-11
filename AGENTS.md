# Repository guide

PlanFlow — a standalone client-only React SPA for visual project planning. No backend;
state persists to localStorage (`planflow.v2`, with automatic migration from
`planflow.v1`).

## Commands

- `bun install` — install dependencies (bun is the package manager; bun.lock)
- `bun run dev` — dev server
- `bun run build` — production build
- `bun run typecheck` — tsc, must stay clean
- `bun run lint` / `bun run format` — eslint + prettier (prettier is enforced via eslint)

There is no test framework; verify changes with `typecheck`, `build`, and by driving the
app (dev server or `vite preview`).

## Domain model

Group ⊃ Task*: groups are top-level containers (never nested, always root); tasks nest
arbitrarily deep under groups or other tasks, and may also live at the root. Tags are
colored labels on items used only for filtering/search. Hierarchy and dependencies are
separate concepts: containment is drawn as nested boxes, dependencies as left→right
arrows.

## Architecture

- `src/lib/` is the pure domain layer — keep it free of React/DOM except `store.ts`
  (`useSyncExternalStore`):
  - `types.ts` — `PlanItem` (group|task), `Dependency`, `Tag`, `Project`.
  - `logic.ts` — `rollUpDone` (parents derive done from children — every child must be
    visited, no short-circuit), `computeBlocked` (own unmet deps OR blocked ancestor),
    `validateDep`/`validateMove` (cycle checks over the combined dependency +
    child→parent graph — prevents deadlocks like depending on your own descendant or
    reparenting a prerequisite under its dependent), `filterVisible` (search/tag
    matching propagated to ancestors and subtrees).
  - `layout.ts` — deterministic auto-layout. Positions are **never stored**; recomputed
    from scratch after every mutation. Items with children become boxes (header +
    padded inner area); dependencies between siblings (lifted from their descendants
    too) create left→right columns; unordered siblings stack vertically.
    `insertTargetAt` resolves a canvas point to a parent scope + fractional sibling
    order for right-click adds.
  - `store.ts` — all mutations; every project mutation passes through `withProject`
    (clone → apply → re-roll-up → bump `updatedAt`). Fractional `order` values slot
    items between siblings without renumbering.
  - `migrate.ts` — one-way v1→v2 data migration.
- `src/components/planner/` — React Flow canvas. Nodes/edges fully derived from the
  store each render; the only feedback accepted from React Flow is selection changes.
  Nodes are not draggable by design. Container nodes get the `pf-pass` class
  (pointer-events pass-through) so canvas panning and gap right-clicks work inside
  them; note that `group` is also a built-in React Flow node type whose default CSS is
  reset in styles.css. `ContextMenu.tsx` drives all right-click editing;
  `TreeDrawer.tsx` is the outline with HTML5 drag-and-drop reparenting via
  `moveItem`.

## Conventions

- Prettier: 100 cols, double quotes, trailing commas (`.prettierrc`).
- Path alias `@/` → `src/` (vite.config.ts + tsconfig paths).
- Colors: single source in `src/lib/colors.ts`, passed to nodes as the `--item` CSS
  variable; soft shades derived in CSS with `color-mix`.
- Vite `base: "./"` — the build must keep working from any subfolder (deploys rely on
  it).
