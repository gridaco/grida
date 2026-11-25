"use client";

import { useMemo } from "react";
import { workspaces as bridgeWorkspaces } from "@/lib/desktop/bridge";
import type { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import { WorkspaceFileMentions } from "./workspace-file-mentions";

export function useWorkspaceFileMentions(
  workspaceId?: string,
  readDirectory?: WorkspaceArtifact.Readdir
) {
  return useMemo(
    () =>
      readDirectory
        ? WorkspaceFileMentions.source(readDirectory)
        : workspaceId
          ? WorkspaceFileMentions.source(
              (path) => bridgeWorkspaces.readdir(workspaceId, path),
              (query) => bridgeWorkspaces.searchPaths(workspaceId, query)
            )
          : undefined,
    [workspaceId, readDirectory]
  );
}
