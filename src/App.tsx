import { ProjectList } from "./components/ProjectList";
import { ProjectPage } from "./components/planner/ProjectPage";
import { ToastHost } from "./components/Toast";
import { useRoute } from "./lib/router";

export function App() {
  const route = useRoute();
  return (
    <>
      {route.view === "project" ? (
        <ProjectPage projectId={route.id} view={route.sub} />
      ) : (
        <ProjectList />
      )}
      <ToastHost />
    </>
  );
}
