import type { NavigationState } from "@grida/desktop-bridge";

/** Inspect only entries in the workbench's current Desktop document. */
export namespace WorkspaceHistory {
  type History = Pick<Navigation, "currentEntry" | "entries">;
  type Target = { key: string; destination?: "home" };

  export function target(
    history: History,
    origin: string,
    offset: -1 | 1
  ): Target | undefined {
    const index = history.currentEntry?.index ?? -1;
    if (index < 0) return;
    return inspect(history.entries()[index + offset], origin);
  }

  export function project(
    history: History,
    origin: string,
    native: NavigationState
  ): NavigationState {
    const index = history.currentEntry?.index ?? -1;
    if (index < 0) return native;
    const entries = history.entries();
    const back = inspect(entries[index - 1], origin);
    const forward = inspect(entries[index + 1], origin);
    return {
      can_go_back: !!back || native.can_go_back,
      can_go_forward: !!forward || native.can_go_forward,
      back_destination: back ? back.destination : native.back_destination,
      forward_destination: forward
        ? forward.destination
        : native.forward_destination,
    };
  }

  function inspect(
    entry: NavigationHistoryEntry | undefined,
    origin: string
  ): Target | undefined {
    if (!entry?.sameDocument || !entry.key || !entry.url) return;
    const url = new URL(entry.url);
    if (url.origin !== origin || !url.pathname.startsWith("/desktop/")) return;
    const home =
      url.pathname === "/desktop/welcome" &&
      !url.searchParams.has("preset") &&
      url.searchParams.get("startup") !== "restore-last-workspace";
    return { key: entry.key, ...(home && { destination: "home" }) };
  }
}
