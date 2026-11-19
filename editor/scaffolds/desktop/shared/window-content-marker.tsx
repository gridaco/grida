"use client";

import { useEffect } from "react";
import { WindowContentState } from "@/lib/desktop/window-content-state";

/** Records the content of the focused Desktop window for the next launch. */
export function WindowContentMarker({
  workspaceId,
  surface,
  basePath,
}:
  | { surface: "home"; workspaceId?: never; basePath?: never }
  | { surface: "workbench"; workspaceId: string; basePath?: never }
  | { surface: "canvas"; workspaceId: string; basePath: string }) {
  useEffect(() => {
    const target: WindowContentState.Target =
      surface === "home"
        ? { surface }
        : surface === "workbench"
          ? { surface, workspace_id: workspaceId }
          : { surface, workspace_id: workspaceId, base_path: basePath };
    const remember = () => {
      WindowContentState.remember(window.localStorage, target);
    };

    if (document.hasFocus()) remember();
    window.addEventListener("focus", remember);
    return () => window.removeEventListener("focus", remember);
  }, [basePath, surface, workspaceId]);

  return null;
}
