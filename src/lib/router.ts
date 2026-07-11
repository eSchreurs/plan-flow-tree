import { useSyncExternalStore } from "react";

export const PROJECT_VIEWS = ["canvas", "graph", "timeline", "map"] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];

export type Route = { view: "home" } | { view: "project"; id: string; sub: ProjectView };

function parse(hash: string): Route {
  const match = /^#\/p\/([^/]+)(?:\/(graph|timeline|map))?/.exec(hash);
  if (!match) return { view: "home" };
  return {
    view: "project",
    id: decodeURIComponent(match[1]),
    sub: (match[2] as ProjectView) ?? "canvas",
  };
}

export function navigate(route: Route) {
  if (route.view === "home") {
    window.location.hash = "#/";
    return;
  }
  const sub = route.sub === "canvas" ? "" : `/${route.sub}`;
  window.location.hash = `#/p/${encodeURIComponent(route.id)}${sub}`;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  return parse(hash);
}
