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

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "target",
  ".turbo",
  ".cache",
]);
const MAX_FILES = 800;
const MAX_DEPTH = 4;
const SKILL_DIRS = [".agents/skills", ".claude/skills"];

export function useWorkspaceComposerCatalog(
  workspaceId: string
): ComposerCatalog {
  const [mentions, setMentions] = useState<ComposerMention[]>([]);
  const [commands, setCommands] = useState<ComposerCommand[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [files, skills] = await Promise.all([
        walkFiles(workspaceId),
        listSkills(workspaceId),
      ]);
      if (cancelled) return;
      setMentions(files);
      setCommands(skills);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return useMemo<ComposerCatalog>(
    () => ({ commands, mentions }),
    [commands, mentions]
  );
}

async function walkFiles(workspaceId: string): Promise<ComposerMention[]> {
  const out: ComposerMention[] = [];
  const queue: Array<{ relPath: string; depth: number }> = [
    { relPath: "", depth: 0 },
  ];
  while (queue.length > 0 && out.length < MAX_FILES) {
    const { relPath: relPath, depth } = queue.shift()!;
    let entries;
    try {
      entries = await bridgeWorkspaces.readdir(workspaceId, relPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.kind === "directory") {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        if (depth < MAX_DEPTH) {
          queue.push({ relPath: entry.rel_path, depth: depth + 1 });
        }
      } else if (entry.kind === "file" || entry.kind === "symlink") {
        out.push({
          id: entry.rel_path,
          label: entry.name,
          kind: "file",
          path: entry.rel_path,
          description: entry.rel_path,
        });
        if (out.length >= MAX_FILES) break;
      }
    }
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
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
