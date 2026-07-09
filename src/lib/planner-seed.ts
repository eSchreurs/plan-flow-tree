import type { PlannerState } from "./planner-types";
import { PHASE_COLORS } from "./planner-types";

const COL_WIDTH = 280;
const ROW_HEIGHT = 80;
const TOP = 40;

export function createSeed(): PlannerState {
  const phases = [
    { title: "Phase 1", tasks: [
      { title: "Project kickoff" },
      { title: "Requirements" },
      { title: "Research", children: [
        { title: "Market analysis" },
        { title: "Competitor review", children: [
          { title: "Top 5 competitors" },
          { title: "Feature matrix" },
        ]},
        { title: "User interviews" },
      ]},
      { title: "Planning" },
      { title: "Documentation" },
    ]},
    { title: "Phase 2", tasks: [
      { title: "Design", children: [
        { title: "UI/UX" },
        { title: "Wireframes" },
        { title: "Design system" },
      ]},
      { title: "Prototype" },
      { title: "Review" },
    ]},
    { title: "Phase 3", tasks: [
      { title: "Development", children: [
        { title: "Frontend" },
        { title: "Backend" },
        { title: "Integrations" },
      ]},
      { title: "Testing" },
      { title: "Documentation" },
    ]},
    { title: "Phase 4", tasks: [
      { title: "Beta release", children: [
        { title: "Internal testing" },
        { title: "Bug fixing" },
        { title: "Feedback" },
      ]},
      { title: "Improvements" },
    ]},
    { title: "Phase 5", tasks: [
      { title: "Release prep" },
      { title: "Final testing" },
      { title: "Launch" },
    ]},
    { title: "Phase 6", tasks: [
      { title: "Monitor" },
      { title: "Support" },
      { title: "Retrospective" },
    ]},
  ];

  const state: PlannerState = {
    projectName: "Project Alpha",
    phases: [],
    tasks: [],
    edges: [],
    positions: {},
  };

  let uid = 0;
  const nid = (p: string) => `${p}_${++uid}`;

  phases.forEach((p, colIdx) => {
    const phaseId = nid("phase");
    const x = colIdx * COL_WIDTH + 40;
    state.phases.push({
      id: phaseId,
      title: p.title,
      color: PHASE_COLORS[colIdx % PHASE_COLORS.length],
      done: false,
      x,
      y: TOP,
    });
    state.positions[phaseId] = { x, y: TOP };

    let row = 1;
    const addTask = (t: any, parentId: string | null, depth: number) => {
      const id = nid("task");
      state.tasks.push({ id, phaseId, parentId, title: t.title, done: false });
      state.positions[id] = { x: x + depth * 24, y: TOP + row * ROW_HEIGHT };
      row++;
      if (t.children) t.children.forEach((c: any) => addTask(c, id, depth + 1));
    };
    p.tasks.forEach((t) => addTask(t, null, 0));
  });

  // default phase dependencies
  for (let i = 0; i < state.phases.length - 1; i++) {
    state.edges.push({
      id: `e_phase_${i}`,
      source: state.phases[i].id,
      target: state.phases[i + 1].id,
    });
  }

  return state;
}
