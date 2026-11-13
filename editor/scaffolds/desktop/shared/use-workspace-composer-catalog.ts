"use client";

/**
 * Builds the `@/kits/composer` catalog for the earlier workspace chat, which
 * only installed Desktop builds without native chat render:
 *
 *   - **mentions** — workspace files in the original compatibility bounds.
 *   - **commands** — discovered skill names (the `.agents/skills` /
 *     `.claude/skills` dirs), for `/`-commands.
 *
 * The native pane takes `/`-commands from its controller and file mentions
 * from `useWorkspaceFileMentions`.
 */

import { useEffect, useMemo, useState } from "react";
import { workspaces as bridgeWorkspaces } from "@/lib/desktop/bridge";
import type { ComposerCatalog, ComposerCommand } from "@/kits/composer";
import { useWorkspaceFileMentions } from "./use-workspace-file-mentions";

const SKILL_DIRS = [".agents/skills", ".claude/skills"];

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
