/**
 * Materializing skill-body loader (server-only, `node:fs`).
 *
 * A real skill is a blackbox tree — `references/` to read, `scripts/` to run,
 * `assets/` to copy. Grida's agent fs + shell are workspace-scoped
 * (GRIDA-SEC-004), so a skill that lives OUTSIDE the workspace (the bundled
 * repo-root `skills/` tree, or `~/.claude/skills`) has to be brought INSIDE a
 * sanctioned root for the agent to touch its files. This loader copies the
 * resolved skill directory into the per-session **scratch** root (already a
 * sanctioned root for both `read_file` and `run_command`) at
 * `<scratch>/skills/<name>/`, then returns the SKILL.md body + any
 * `metadata.also_in_load` companions inlined + the absolute base directory the
 * agent can reach.
 *
 * This is the host-agnostic analogue of what Claude Code / opencode do with an
 * unscoped fs (they read skills in place): the copy target is the host-provided
 * writable sandbox, so the same model serves the desktop and a future CLI.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { readSkillBody } from "./discovery";
import type { DiscoveredSkill, SkillBodyLoader } from "./types";

/**
 * Build a {@link SkillBodyLoader} that materializes each loaded skill's tree
 * into `<scratchDir>/skills/<name>/` before returning its body. A flat
 * (`<name>.md`) skill has no companion tree, so it is returned body-only.
 */
export function createMaterializingSkillLoader(
  scratchDir: string
): SkillBodyLoader {
  return async (skill: DiscoveredSkill): Promise<string> => {
    const body = await readSkillBody(skill.path);
    // Flat, body-only skill (no directory) — nothing to materialize.
    if (!skill.dir) return body;

    const destDir = path.join(scratchDir, "skills", skill.name);
    await fs.mkdir(destDir, { recursive: true });
    await copyTree(skill.dir, destDir);

    const extras = await inlineCompanions(destDir, skill.also_in_load ?? []);
    return [
      body,
      ...extras,
      `\n\n---\n\nThis skill's files are materialized on disk at:\n${destDir}\n` +
        `Relative paths in this skill (\`scripts/\`, \`references/\`, \`assets/\`) ` +
        `are under that directory — read them with read_file or run them with ` +
        `run_command.`,
    ].join("");
  };
}

/** Read each `also_in_load` companion (relative to the copied dir) and format
 *  it as an inlined block appended after the body. Missing/escaping paths are
 *  skipped. */
async function inlineCompanions(
  destDir: string,
  rels: readonly string[]
): Promise<string[]> {
  const out: string[] = [];
  for (const rel of rels) {
    const abs = path.join(destDir, rel);
    // GRIDA-SEC-007: rule 4 — `also_in_load` is skill-authored; refuse a
    // companion path that resolves outside the materialized dir (`..`/absolute).
    const within = path.relative(destDir, abs);
    if (within.startsWith("..") || path.isAbsolute(within)) continue;
    try {
      const content = await fs.readFile(abs, "utf8");
      out.push(`\n\n---\n\n# Inlined: ${rel}\n\n${content}`);
    } catch {
      // A declared-but-missing companion is not fatal — skip it.
    }
  }
  return out;
}

/**
 * GRIDA-SEC-007: rule 3 — recursively copy `src` into `dest`, files and
 * directories ONLY. Symlinks and other special entries are SKIPPED (never
 * followed), so a hostile workspace/user skill can't smuggle a link that
 * escapes the tree into the sanctioned scratch root. See /SECURITY.md.
 */
async function copyTree(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  // Siblings are independent — copy them concurrently. A subtree still awaits
  // its own parent `mkdir` before recursing, so ordering within a branch holds.
  await Promise.all(
    entries.map(async (entry) => {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(d, { recursive: true });
        await copyTree(s, d);
      } else if (entry.isFile()) {
        await fs.copyFile(s, d);
      }
      // isSymbolicLink / sockets / fifos: skipped by omission.
    })
  );
}
