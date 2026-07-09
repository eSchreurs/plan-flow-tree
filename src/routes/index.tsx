import { createFileRoute } from "@tanstack/react-router";
import { Planner } from "@/components/planner/Planner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Project Planner — Visual dependency planning" },
      {
        name: "description",
        content:
          "Plan projects as phase and task dependency trees on a single interactive canvas.",
      },
      { property: "og:title", content: "Project Planner" },
      {
        property: "og:description",
        content: "Visual project planner with phases, nested tasks, and dependency arrows.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <Planner />;
}
