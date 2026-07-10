import { useSyncExternalStore } from "react";

export type Route = { view: "home" } | { view: "project"; id: string };

function parse(hash: string): Route {
  const match = /^#\/p\/([^/]+)/.exec(hash);
  return match ? { view: "project", id: decodeURIComponent(match[1]) } : { view: "home" };
}

export function navigate(route: Route) {
  window.location.hash = route.view === "home" ? "#/" : `#/p/${encodeURIComponent(route.id)}`;
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
