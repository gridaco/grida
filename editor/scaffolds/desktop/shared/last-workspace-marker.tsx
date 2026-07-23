"use client";

import { useEffect } from "react";
import { last_workspace } from "@/lib/desktop/last-workspace";

/** Records the last focused workspace-backed desktop surface. */
export function LastWorkspaceMarker({
  workspaceId,
  surface,
  basePath = "",
}: {
  workspaceId: string;
  surface: "workbench" | "canvas";
  basePath?: string;
}) {
  useEffect(() => {
    const remember = () => {
      const target: last_workspace.Target =
        surface === "workbench"
          ? { surface, workspace_id: workspaceId }
          : { surface, workspace_id: workspaceId, base_path: basePath };
      last_workspace.remember(window.localStorage, target);
    };

    if (document.hasFocus()) remember();
    window.addEventListener("focus", remember);
    return () => window.removeEventListener("focus", remember);
  }, [basePath, surface, workspaceId]);

  return null;
}
