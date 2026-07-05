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
import { containsPath } from "@grida/daemon/server";
import {
  InvalidFrontmatterError,
  MissingFrontmatterError,
  parseFrontmatter,
  parseSkillManifest,
  SKILL_NAME_RE,
} from "./frontmatter";
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
  /**
   * The host-bundled skills directory (the repo-root `skills/` tree, shipped
   * with the app). Scanned as the LOWEST-precedence `bundled` layer, so a
   * project/user skill of the same name shadows a built-in. Host-injected
   * (desktop = packaged resources; a CLI = a flag/default) so the same model
   * serves every host.
   */
  bundled_dir?: string;
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

  // 1. Project — upward from workspaceRoot, nearest first. The HOME dir is
  //    skipped here: `~/.claude/skills` / `~/.agents/skills` are the USER-scoped
  //    source (§2, gated by `include_user_scoped`), NOT project skills. Without
  //    this skip a workspace under `~` (e.g. `~/Documents/Grida/<project>`) would
  //    climb through home and re-discover the user's global skills as "project"
  //    ones — which is exactly how a `find-skills` meta-skill hijacked a deck task.
  if (opts.workspace_root) {
    const home = path.resolve(opts.home_dir ?? os.homedir());
    for (const dir of walkUp(opts.workspace_root, opts.stop_at)) {
      if (dir === home) continue;
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

  // 4. Host-bundled tree (repo-root `skills/`) — lowest precedence, so a
  //    project/user skill of the same name shadows a built-in.
  if (opts.bundled_dir) {
    candidates.push(...(await readSkillsDir(opts.bundled_dir, "bundled")));
  }

  // 5. Pre-resolved / remote-cached (already resolved by the caller).
  for (const s of opts.extra ?? []) candidates.push(s);

  // Fold: first definition wins; warn + skip later duplicates.
  const byName = new Map<string, DiscoveredSkill>();
  for (const s of candidates) {
    if (byName.has(s.name)) {
      warn(
        `[skills] duplicate skill "${s.name}" at ${s.path} ignored; ` +
          `first definition (${byName.get(s.name)!.path}) wins`
      );
      continue;
    }
    byName.set(s.name, s);
  }
  // `skills` is just the map's values in insertion order (Map preserves it) —
  // no parallel array to keep in sync with `by_name`.
  return { skills: Array.from(byName.values()), by_name: byName };
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
 * `SKILL.md` is a skill; a flat `<name>.md` is the fallback (body-only) form.
 * Missing dirs, non-conformant names, unreadable/malformed entries, and
 * symlink escapes are skipped silently — a hostile or empty skills dir must
 * not poison the whole listing (an explicit `resolve` would surface the error).
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
  const layerRoot = await safeRealpath(path.resolve(dir));
  if (layerRoot == null) return [];

  const out: DiscoveredSkill[] = [];
  for (const entry of entries) {
    // GRIDA-SEC-007: rule 3 — never admit a symlink into the listing. A symlink
    // dirent reports neither isFile() nor isDirectory(), so without this it
    // would slip past the `.md` gate below and be accepted as a flat skill (a
    // contained link with an unexpected name). Matches copyTree's no-symlink
    // policy — discovery never follows a link.
    if (entry.isSymbolicLink()) continue;
    // GRIDA-SEC-007: rule 1 — the entry basename becomes a path segment, so it
    // must be a safe, agentskills.io-conformant name. Reject `..`, absolute
    // paths, and separators without reading anything.
    const base = entry.isFile() ? entry.name.replace(/\.md$/, "") : entry.name;
    if (entry.isFile() && !entry.name.endsWith(".md")) continue;
    if (!SKILL_NAME_RE.test(base)) continue;

    const skillDir = entry.isDirectory()
      ? path.join(dir, entry.name)
      : undefined;
    const skillPath = entry.isDirectory()
      ? path.join(dir, entry.name, "SKILL.md")
      : path.join(dir, entry.name);

    // Symlink containment: the resolved SKILL.md must stay inside the layer
    // root. A symlinked skill dir/file that escapes is dropped from the listing.
    if (!(await isContained(layerRoot, skillPath))) continue;

    const skill = await readSkillManifest(
      skillPath,
      skillDir,
      layerRoot,
      source
    );
    if (skill) out.push(skill);
  }
  // Deterministic order within a directory (readdir order is platform-dependent).
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function readSkillManifest(
  skillPath: string,
  skillDir: string | undefined,
  layerRoot: string,
  source: SkillSource
): Promise<DiscoveredSkill | null> {
  let raw: string;
  try {
    raw = await fs.readFile(skillPath, "utf8");
  } catch {
    return null;
  }
  // Strict parse; a malformed manifest is invisible in a listing (skipped),
  // not fatal. Extension fields (`metadata.also_in_load`) ride along.
  let manifest;
  try {
    ({ manifest } = parseSkillManifest(raw));
  } catch (err) {
    if (
      err instanceof MissingFrontmatterError ||
      err instanceof InvalidFrontmatterError
    ) {
      return null;
    }
    throw err;
  }
  return {
    name: manifest.name,
    description: manifest.description,
    path: skillPath,
    dir: skillDir,
    also_in_load: extractAlsoInLoad(manifest.metadata),
    // The realpath'd layer root, captured now — the load-time anchor
    // (GRIDA-SEC-007 rule 5) so a later layer-dir swap can't move it.
    layer_root: layerRoot,
    source,
  };
}

/** Extract the `metadata.also_in_load` string list (relative companion paths),
 *  ignoring any non-string entries. Absent ⇒ undefined. */
function extractAlsoInLoad(
  metadata: Record<string, unknown> | undefined
): string[] | undefined {
  const raw = metadata?.also_in_load;
  if (!Array.isArray(raw)) return undefined;
  const list = raw.filter((x): x is string => typeof x === "string");
  return list.length > 0 ? list : undefined;
}

async function safeRealpath(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

/** GRIDA-SEC-007: rule 2 — true when `target` canonicalises (realpath) to a
 *  path inside `realRoot` (already a realpath). A symlinked skill dir/file that
 *  escapes its layer root is rejected here. Missing target ⇒ "not contained"
 *  (skip), never an error. Containment itself is the shared `containsPath`
 *  string-prefix gate (the same one the shell runner + scratch asserts use), so
 *  the discipline can't drift between copies. See /SECURITY.md. */
async function isContained(realRoot: string, target: string): Promise<boolean> {
  const real = await safeRealpath(target);
  if (real == null) return false;
  return containsPath(realRoot, real);
}

/** GRIDA-SEC-007: rule 5 — a discovered skill path that no longer
 *  canonicalises inside its layer at LOAD time (distinct from "not found").
 *  Signals a post-discovery symlink swap; the load is refused. */
export class SkillPathEscapeError extends Error {
  constructor(public readonly skill_path: string) {
    super(`[skills] skill path escaped its layer at load: ${skill_path}`);
    this.name = "SkillPathEscapeError";
  }
}

/**
 * GRIDA-SEC-007: rule 5 — re-validate a discovered skill's on-disk paths at
 * LOAD time, closing the discovery→load TOCTOU. Discovery containment-checked
 * `<layer>/<name>` when the index was built, but the filesystem can change
 * underneath: a checkout or a shell command can replace the skill dir (or the
 * layer dir itself) with a symlink before the model calls the `skill` tool, and
 * a blind `readdir`/read of the stored string path would then follow the link
 * out of the layer. Here we re-realpath the dir + its `SKILL.md` (or the flat
 * `<name>.md`) and re-contain them against the DISCOVERY-TIME layer root
 * (`skill.layer_root`, captured + realpath'd when the index was built) — NOT a
 * root recomputed now, which a layer-dir swap would move in lockstep with the
 * target. Returns the canonical paths the caller must read/copy from. Throws
 * {@link SkillPathEscapeError} on escape.
 */
export async function resolveSkillLoadPaths(
  skill: Pick<DiscoveredSkill, "dir" | "path" | "layer_root">
): Promise<{ dir: string | null; body_path: string }> {
  if (skill.dir) {
    // Anchor to the discovery-time layer root; fall back to a load-time
    // dirname only for pre-resolved (`extra`) skills that carry no anchor.
    const layerRoot =
      skill.layer_root ?? (await safeRealpath(path.dirname(skill.dir)));
    const realDir = await safeRealpath(skill.dir);
    if (
      layerRoot == null ||
      realDir == null ||
      !containsPath(layerRoot, realDir)
    ) {
      throw new SkillPathEscapeError(skill.dir);
    }
    const realBody = await safeRealpath(path.join(realDir, "SKILL.md"));
    if (realBody == null || !containsPath(realDir, realBody)) {
      throw new SkillPathEscapeError(path.join(skill.dir, "SKILL.md"));
    }
    return { dir: realDir, body_path: realBody };
  }
  // Flat `<layer>/<name>.md` skill — no tree, just the body file.
  const layerRoot =
    skill.layer_root ?? (await safeRealpath(path.dirname(skill.path)));
  const realBody = await safeRealpath(skill.path);
  if (
    layerRoot == null ||
    realBody == null ||
    !containsPath(layerRoot, realBody)
  ) {
    throw new SkillPathEscapeError(skill.path);
  }
  return { dir: null, body_path: realBody };
}

/** Read the instructional body of a skill (frontmatter stripped). */
export async function readSkillBody(skillPath: string): Promise<string> {
  const raw = await fs.readFile(skillPath, "utf8");
  return parseFrontmatter(raw).body.trim();
}

/**
 * The node-fs {@link SkillBodyLoader} the server injects into the `skill`
 * tool. Re-validates the discovered path at load time (GRIDA-SEC-007 rule 5)
 * then reads the body from the canonical `SKILL.md`.
 */
export const nodeSkillBodyLoader: SkillBodyLoader = async (skill) => {
  const { body_path } = await resolveSkillLoadPaths(skill);
  return readSkillBody(body_path);
};
