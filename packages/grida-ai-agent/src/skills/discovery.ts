/**
 * Skill discovery (RFC `skills / discovery sources`).
 *
 * Skills are discovered once, at session start, from a layered set of
 * sources walked in order. First definition wins on a name collision;
 * a later duplicate logs a warning and is skipped. The resulting index
 * is static for the session's lifetime — a skill added to disk
 * mid-session is invisible until the next session.
 *
 * Sources, in precedence order:
 *   1. Project-scoped — walk upward from the workspace root collecting
 *      `.agents/skills/` and `.claude/skills/`; the nearest wins.
 *   2. User-scoped — `~/.agents/skills/`, `~/.claude/skills/`.
 *   3. Config-declared paths — absolute skill dirs from host/project config.
 *   4. Host-bundled — skills the host ships, pre-resolved.
 *
 * Remote URLs (RFC source 5) are a host concern fetched + cached before
 * this runs; pass the cached results in via {@link DiscoverSkillsOptions.extra}.
 *
 * Each skill is `<dir>/<name>/SKILL.md` (the Grida convention) or, as a
 * fallback, a flat `<dir>/<name>.md`.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import type {
  DiscoveredSkill,
  SkillBodyLoader,
  SkillIndex,
  SkillSource,
} from "./types";

export type {
  DiscoveredSkill,
  SkillBodyLoader,
  SkillIndex,
  SkillSource,
} from "./types";

export type DiscoverSkillsOptions = {
  /** Root the agent is rooted at. Project skills are walked up from here. */
  workspace_root?: string;
  /**
   * Stop the upward project walk at this directory (inclusive). Defaults
   * to the filesystem root. Tests pass a fixture boundary so the walk
   * doesn't escape into the real repo's `.agents/skills`.
   */
  stop_at?: string;
  /** Include `~/.agents/skills` + `~/.claude/skills`. Default true. */
  include_user_scoped?: boolean;
  /** Override the home dir (tests). Defaults to `os.homedir()`. */
  home_dir?: string;
  /** Absolute skill directories from host/project config. */
  config_paths?: string[];
  /** Pre-resolved skills the host ships (or remote-fetched + cached). */
  extra?: DiscoveredSkill[];
  /** Warning sink for duplicate-name collisions. Defaults to console.warn. */
  on_warn?: (message: string) => void;
};

const SKILL_DIR_NAMES = [".agents/skills", ".claude/skills"] as const;

/**
 * Discover skills from every source and fold them into one index.
 */
export async function discoverSkills(
  opts: DiscoverSkillsOptions = {}
): Promise<SkillIndex> {
  const warn = opts.on_warn ?? ((m: string) => console.warn(m));
  const candidates: DiscoveredSkill[] = [];

  // 1. Project — upward from workspaceRoot, nearest first.
  if (opts.workspace_root) {
    for (const dir of walkUp(opts.workspace_root, opts.stop_at)) {
      for (const skillsDirName of SKILL_DIR_NAMES) {
        candidates.push(
          ...(await readSkillsDir(path.join(dir, skillsDirName), "project"))
        );
      }
    }
  }

  // 2. User-scoped.
  if (opts.include_user_scoped !== false) {
    const home = opts.home_dir ?? os.homedir();
    for (const skillsDirName of SKILL_DIR_NAMES) {
      candidates.push(
        ...(await readSkillsDir(path.join(home, skillsDirName), "user"))
      );
    }
  }

  // 3. Config-declared paths.
  for (const dir of opts.config_paths ?? []) {
    candidates.push(...(await readSkillsDir(dir, "config")));
  }

  // 4. Host-bundled / remote-cached (already resolved by the caller).
  for (const s of opts.extra ?? []) candidates.push(s);

  // Fold: first definition wins; warn + skip later duplicates.
  const byName = new Map<string, DiscoveredSkill>();
  const skills: DiscoveredSkill[] = [];
  for (const s of candidates) {
    if (byName.has(s.name)) {
      warn(
        `[skills] duplicate skill "${s.name}" at ${s.path} ignored; ` +
          `first definition (${byName.get(s.name)!.path}) wins`
      );
      continue;
    }
    byName.set(s.name, s);
    skills.push(s);
  }
  return { skills, by_name: byName };
}

/** Yield `start`, its parent, grandparent, … up to (and including) `stopAt`. */
function* walkUp(start: string, stopAt?: string): Generator<string> {
  let dir = path.resolve(start);
  const boundary = stopAt ? path.resolve(stopAt) : undefined;
  for (;;) {
    yield dir;
    if (boundary && dir === boundary) return;
    const parent = path.dirname(dir);
    if (parent === dir) return; // filesystem root
    dir = parent;
  }
}

/**
 * Read one `.../skills` directory. Each immediate child `<name>/` with a
 * `SKILL.md` is a skill; a flat `<name>.md` is the fallback form. Missing
 * dirs and unreadable / frontmatter-less entries are skipped silently
 * (a directory that simply has no skills is not an error).
 */
async function readSkillsDir(
  dir: string,
  source: SkillSource
): Promise<DiscoveredSkill[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: DiscoveredSkill[] = [];
  for (const entry of entries) {
    let skillPath: string | null = null;
    if (entry.isDirectory()) {
      skillPath = path.join(dir, entry.name, "SKILL.md");
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      skillPath = path.join(dir, entry.name);
    }
    if (!skillPath) continue;
    const skill = await readSkillManifest(skillPath, source);
    if (skill) out.push(skill);
  }
  // Deterministic order within a directory (readdir order is platform-dependent).
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function readSkillManifest(
  skillPath: string,
  source: SkillSource
): Promise<DiscoveredSkill | null> {
  let raw: string;
  try {
    raw = await fs.readFile(skillPath, "utf8");
  } catch {
    return null;
  }
  const { fields } = parseFrontmatter(raw);
  const name = fields.name?.trim();
  const description = fields.description?.trim();
  // A skill with no name or no description is invisible to the model
  // (RFC: "A vague description … is invisible"). Skip — don't advertise
  // a hook the model can't act on.
  if (!name || !description) return null;
  return { name, description, path: skillPath, source };
}

/** Read the instructional body of a skill (frontmatter stripped). */
export async function readSkillBody(skillPath: string): Promise<string> {
  const raw = await fs.readFile(skillPath, "utf8");
  return parseFrontmatter(raw).body.trim();
}

/**
 * The node-fs {@link SkillBodyLoader} the server injects into the `skill`
 * tool. Reads each skill's body by its discovered absolute path.
 */
export const nodeSkillBodyLoader: SkillBodyLoader = (skill) =>
  readSkillBody(skill.path);
