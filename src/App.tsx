import { ProjectList } from "./components/ProjectList";
import { PlannerPage } from "./components/planner/PlannerPage";
import { ToastHost } from "./components/Toast";
import { useRoute } from "./lib/router";

export function App() {
  const route = useRoute();
  return (
    <>
      {route.view === "project" ? <PlannerPage projectId={route.id} /> : <ProjectList />}
      <ToastHost />
    </>
  );
}
