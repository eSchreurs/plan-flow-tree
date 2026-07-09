export type ID = string;

export interface TaskNode {
  id: ID;
  phaseId: ID;
  parentId: ID | null;
  title: string;
  done: boolean;
}

export interface Phase {
  id: ID;
  title: string;
  color: string; // token key
  done: boolean;
  x: number;
  y: number;
}

export interface DependencyEdge {
  id: ID;
  source: ID; // node id (phase or task)
  target: ID;
  manual?: boolean;
}

export interface PlannerState {
  projectName: string;
  phases: Phase[];
  tasks: TaskNode[];
  edges: DependencyEdge[];
  positions: Record<ID, { x: number; y: number }>;
}

export const PHASE_COLORS = [
  "phase-red",
  "phase-orange",
  "phase-yellow",
  "phase-green",
  "phase-blue",
  "phase-purple",
] as const;
