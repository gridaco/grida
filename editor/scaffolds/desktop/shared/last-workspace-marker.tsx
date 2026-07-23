"use client";

import { useEffect } from "react";
import { last_workspace } from "@/lib/desktop/last-workspace";

/** Records the last focused workspace-backed desktop surface. */
export function LastWorkspaceMarker({
  workspaceId,
  surface,
  basePath = "",
  activePath,
}: {
  workspaceId: string;
  surface: "workbench" | "canvas";
  basePath?: string;
  /**
   * Workbench only: a relative artifact path, null for an empty editor group,
   * or undefined while initial artifact restoration is still settling.
   */
  activePath?: string | null;
}) {
  useEffect(() => {
    const remember = () => {
      // Restoration starts from the saved value itself. Do not clear it during
      // the short interval before the workbench validates and opens that path.
      if (surface === "workbench" && activePath === undefined) return;
      const target: last_workspace.Target =
        surface === "workbench"
          ? {
              surface,
              workspace_id: workspaceId,
              ...(activePath ? { active_path: activePath } : {}),
            }
          : { surface, workspace_id: workspaceId, base_path: basePath };
      last_workspace.remember(window.localStorage, target);
    };

    if (document.hasFocus()) remember();
    window.addEventListener("focus", remember);
    return () => window.removeEventListener("focus", remember);
  }, [activePath, basePath, surface, workspaceId]);

  return null;
}
