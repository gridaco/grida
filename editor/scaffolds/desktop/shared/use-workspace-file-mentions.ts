"use client";

/**
 * Workspace files for the chat composer's `@`-references. A bounded walk
 * (depth and count capped, heavy directories skipped) keeps it cheap; the
 * composer filters client-side as the user types.
 */

import { useEffect, useMemo, useState } from "react";
import { workspaces as bridgeWorkspaces } from "@/lib/desktop/bridge";
import type { ComposerMention } from "@/kits/composer";
import { WorkspaceFileMentions } from "./workspace-file-mentions";

const NO_MENTIONS: ComposerMention[] = [];

export function useWorkspaceFileMentions(
  workspaceId?: string,
  mode: WorkspaceFileMentions.Mode = "native"
): ComposerMention[] {
  const request = useMemo(() => ({ workspaceId, mode }), [workspaceId, mode]);
  const [loaded, setLoaded] = useState<{
    request: typeof request;
    mentions: ComposerMention[];
  }>();
  useEffect(() => {
    const { workspaceId, mode } = request;
    if (!workspaceId) return;
    const owner = new AbortController();
    void WorkspaceFileMentions.list(
      (path) => bridgeWorkspaces.readdir(workspaceId, path),
      owner.signal,
      mode
    ).then((mentions) => {
      if (!owner.signal.aborted) setLoaded({ request, mentions });
    });
    return () => owner.abort();
  }, [request]);
  return loaded?.request === request ? loaded.mentions : NO_MENTIONS;
}
