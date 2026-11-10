"use client";

/**
 * Builds the `@/kits/composer` catalog for the workspace agent chat:
 *
 *   - **mentions** — workspace files, for `@`-references. A bounded walk
 *     (depth + count capped, heavy dirs skipped) keeps it cheap; the
 *     composer filters client-side as the user types.
 *   - **commands** — discovered skill names (the `.agents/skills` /
 *     `.claude/skills` dirs), for `/`-commands. Reuses the workspace
 *     readdir bridge — no extra host route.
 */

import { useEffect, useMemo, useState } from "react";
import { workspaces as bridgeWorkspaces } from "@/lib/desktop/bridge";
import type {
  ComposerCatalog,
  ComposerCommand,
  ComposerMention,
} from "@/kits/composer";
import { WorkspaceFileMentions } from "./workspace-file-mentions";

const NO_MENTIONS: ComposerMention[] = [];
const SKILL_DIRS = [".agents/skills", ".claude/skills"];

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

export function useWorkspaceComposerCatalog(
  workspaceId: string
): ComposerCatalog {
  const mentions = useWorkspaceFileMentions(workspaceId, "compatibility");
  const [commands, setCommands] = useState<ComposerCommand[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listSkills(workspaceId).then((skills) => {
      if (!cancelled) setCommands(skills);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return useMemo<ComposerCatalog>(
    () => ({ commands, mentions }),
    [commands, mentions]
  );
}

async function listSkills(workspaceId: string): Promise<ComposerCommand[]> {
  const names = new Set<string>();
  for (const dir of SKILL_DIRS) {
    let entries;
    try {
      entries = await bridgeWorkspaces.readdir(workspaceId, dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.kind === "directory") names.add(entry.name);
    }
  }
  return [...names]
    .sort()
    .map((name) => ({ id: name, title: name, description: "skill" }));
}
