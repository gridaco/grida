/**
 * Project instructions (RFC `skills / project instructions`).
 *
 * Unconditional knowledge committed to the repo at a well-known path
 * (`AGENTS.md` / `CLAUDE.md` / `CONTEXT.md`). Unlike skills, these go
 * straight into the system prompt every turn — no advertise-then-load.
 *
 * Discovery walks UPWARD from the workspace root collecting every
 * instruction file, then concatenates them **nearest-last** so the
 * closest file (the project root) has the final word.
 */

import fs from "node:fs/promises";
import path from "node:path";

/** Canonical instruction filenames, honored for interoperability. */
export const INSTRUCTION_FILENAMES = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md",
] as const;

/**
 * Soft cap on total instruction size (RFC recommends ~8k tokens). We
 * approximate tokens as `chars / 4`; overflow is truncated with a
 * marker rather than dropped wholesale so the head still lands.
 */
const DEFAULT_MAX_TOKENS = 8_000;
const CHARS_PER_TOKEN = 4;

export type ProjectInstructionFile = {
  path: string;
  content: string;
};

export type DiscoverProjectInstructionsOptions = {
  workspace_root: string;
  /** Stop the upward walk here (inclusive). Defaults to the FS root. */
  stop_at?: string;
  /** Token budget across all files. Default 8000. */
  max_tokens?: number;
};

export type ProjectInstructions = {
  /** Concatenated, nearest-last, capped. Empty string when none found. */
  text: string;
  /** The files that contributed, outermost-first (the concat order). */
  files: ProjectInstructionFile[];
  /** True when the cap truncated the concatenated body. */
  truncated: boolean;
};

/**
 * Collect and concatenate project instruction files from the workspace
 * root upward. Nearest-last: outermost (user/ancestor) first, project
 * root last, so the most specific instructions win.
 */
export async function discoverProjectInstructions(
  opts: DiscoverProjectInstructionsOptions
): Promise<ProjectInstructions> {
  const boundary = opts.stop_at ? path.resolve(opts.stop_at) : undefined;
  // Walk upward collecting dirs (nearest → outermost), then reverse so we
  // concatenate outermost → nearest.
  const dirs: string[] = [];
  let dir = path.resolve(opts.workspace_root);
  for (;;) {
    dirs.push(dir);
    if (boundary && dir === boundary) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dirs.reverse();

  const files: ProjectInstructionFile[] = [];
  for (const d of dirs) {
    for (const name of INSTRUCTION_FILENAMES) {
      const p = path.join(d, name);
      let content: string;
      try {
        content = await fs.readFile(p, "utf8");
      } catch {
        continue;
      }
      const trimmed = content.trim();
      if (trimmed.length > 0) files.push({ path: p, content: trimmed });
    }
  }

  const maxChars = (opts.max_tokens ?? DEFAULT_MAX_TOKENS) * CHARS_PER_TOKEN;
  const joined = files
    .map((f) => `<!-- ${f.path} -->\n${f.content}`)
    .join("\n\n");
  if (joined.length <= maxChars) {
    return { text: joined, files, truncated: false };
  }
  return {
    text:
      joined.slice(0, maxChars) +
      "\n\n<!-- project instructions truncated (token cap) -->",
    files,
    truncated: true,
  };
}
