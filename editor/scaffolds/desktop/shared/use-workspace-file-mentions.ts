"use client";

/**
 * Workspace files for the chat composer's `@`-references. A bounded walk
 * (depth and count capped, heavy directories skipped) keeps it cheap; the
 * composer filters client-side as the user types.
 */

import { useEffect, useMemo, useState } from "react";
import { workspaces as bridgeWorkspaces } from "@/lib/desktop/bridge";
import type { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import type { ComposerMention } from "@/kits/composer";
import { WorkspaceFileMentions } from "./workspace-file-mentions";

const NO_MENTIONS: ComposerMention[] = [];

export function useWorkspaceFileMentions(
  workspaceId?: string,
  readDirectory?: WorkspaceArtifact.Readdir
): ComposerMention[] {
  const request = useMemo(
    () => ({ workspaceId, readDirectory }),
    [workspaceId, readDirectory]
  );
  const [loaded, setLoaded] = useState<{
    request: typeof request;
    mentions: ComposerMention[];
  }>();
  useEffect(() => {
    const { workspaceId, readDirectory } = request;
    const readdir =
      readDirectory ??
      (workspaceId
        ? (path: string) => bridgeWorkspaces.readdir(workspaceId, path)
        : undefined);
    if (!readdir) return;
    const owner = new AbortController();
    void WorkspaceFileMentions.list(readdir, owner.signal).then((mentions) => {
      if (!owner.signal.aborted) setLoaded({ request, mentions });
    });
    return () => owner.abort();
  }, [request]);
  return loaded?.request === request ? loaded.mentions : NO_MENTIONS;
}
