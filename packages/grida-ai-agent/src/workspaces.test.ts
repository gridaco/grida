/**
 * Contract pins — Workspaces (GRIDA-SEC-004).
 *
 * Maps to docs/wg/ai/grida/architecture.md §Test pins → describe("Workspaces").
 *
 * The registry is the agent host's record of "directories the user opened."
 * Its three load-bearing behaviors: git-root expansion (open a subdir,
 * register the repo), a path-stable id (same dir → same id across
 * launches), and independent coexistence of multiple opened roots —
 * the per-root scopes the future srt fs-policy unions together.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceRegistry } from "./workspaces";

function expectedId(realRoot: string): string {
  return crypto
    .createHash("sha256")
    .update(realRoot)
    .digest("hex")
    .slice(0, 16);
}

describe("Workspaces", () => {
  let baseDir: string;
  let userDataDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-workspaces-"));
    userDataDir = path.join(baseDir, "userdata");
    await fs.mkdir(userDataDir);
  });
  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("open(directory-inside-repo) expands to repo root", async () => {
    // A repo is "a directory containing a .git entry" — findGitRoot
    // accepts a .git directory or file, so a bare mkdir is enough; no
    // child process needed. (os.tmpdir() is not inside a git tree, so
    // this .git is the only one the upward walk can find.)
    const repo = path.join(baseDir, "repo");
    const sub = path.join(repo, "packages", "deep");
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });
    await fs.mkdir(sub, { recursive: true });

    const registry = new WorkspaceRegistry(userDataDir);
    const ws = await registry.open(sub);

    const repoReal = await fs.realpath(repo);
    expect(ws.root).toBe(repoReal);
    expect(ws.name).toBe(path.basename(repoReal));
  });

  it("workspace id is stable across close/reopen", async () => {
    const dir = path.join(baseDir, "plain");
    await fs.mkdir(dir);
    const dirReal = await fs.realpath(dir);

    // First "session".
    const a = new WorkspaceRegistry(userDataDir);
    const first = await a.open(dir);
    expect(first.id).toBe(expectedId(dirReal));

    // Reopen in a fresh registry (new launch, same userData) → same id.
    const b = new WorkspaceRegistry(userDataDir);
    const second = await b.open(dir);
    expect(second.id).toBe(first.id);

    // A third fresh registry that only reads (no open) finds the
    // persisted entry by that id — id survives the round-trip to disk.
    const c = new WorkspaceRegistry(userDataDir);
    expect(await c.findById(first.id)).not.toBeNull();
  });

  it("ad-hoc files coexist with workspaces in the sandbox fs scope union", async () => {
    // Two opened workspaces (no git → each is its own root). They must
    // coexist independently: both appear in the roots snapshot the
    // fs-policy reads, and each scopes containment to itself.
    const w1 = path.join(baseDir, "ws-one");
    const w2 = path.join(baseDir, "ws-two");
    await fs.mkdir(w1);
    await fs.mkdir(w2);
    const w1Real = await fs.realpath(w1);
    const w2Real = await fs.realpath(w2);

    const registry = new WorkspaceRegistry(userDataDir);
    await registry.open(w1);
    await registry.open(w2);
    await registry.list(); // warm the sync containsPath path

    const roots = registry.rootsSnapshot();
    expect(roots).toContain(w1Real);
    expect(roots).toContain(w2Real);

    // Each workspace contains its own tree; neither contains the other
    // nor an unrelated ad-hoc path outside both.
    expect(registry.containsPath(path.join(w1Real, "a.txt"))).toBe(true);
    expect(registry.containsPath(path.join(w2Real, "b.txt"))).toBe(true);
    expect(registry.containsPath(path.join(baseDir, "loose-adhoc.txt"))).toBe(
      false
    );
  });

  // Phase B+ coverage target once host sandbox policy compilation lands:
  // srt fs-policy unions workspace roots, ad-hoc docIds, and userData.
});
