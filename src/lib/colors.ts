import type { ColorKey } from "./types";

/**
 * Single source of truth for item colors. Passed into nodes as the `--item`
 * CSS variable (soft shades are derived with color-mix in CSS) and used
 * directly where SVG needs literal values (edge markers, minimap).
 */
export const COLOR_HEX: Record<ColorKey, string> = {
  slate: "#64748b",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  green: "#22c55e",
  teal: "#14b8a6",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  pink: "#ec4899",
};

/** Dependency edge whose prerequisite is finished. */
export const EDGE_SATISFIED = "#94a3b8";
/** Dependency edge still waiting on its prerequisite. */
export const EDGE_PENDING = "#f59e0b";
/** Branch connector from a deep parent task to its subtasks. */
export const EDGE_TREE = "#cbd5e1";
