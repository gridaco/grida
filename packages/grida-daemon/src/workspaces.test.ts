/**
 * Contract pins — Workspaces (GRIDA-SEC-004).
 *
 * Maps to docs/wg/ai/grida/architecture.md §Test pins → describe("Workspaces").
 *
 * The registry is the agent host's record of "directories the user opened."
 * Its load-bearing behaviors: the root is exactly the opened directory (no
 * git-root expansion — always respect what the user opened), a path-stable id
 * (same dir → same id across launches), and independent coexistence of
 * multiple opened roots — the per-root scopes the future srt fs-policy unions
 * together.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceRegistry, type Workspace } from "./workspaces";

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

  it("open(directory-inside-repo) registers the opened directory, not the repo root", async () => {
    // A `.git` at the repo root must NOT pull the workspace up to it — the
    // root is exactly what the user opened. (os.tmpdir() is not inside a git
    // tree, so this `.git` is the only one an upward walk could have found.)
    const repo = path.join(baseDir, "repo");
    const sub = path.join(repo, "packages", "deep");
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });
    await fs.mkdir(sub, { recursive: true });

    const registry = new WorkspaceRegistry(userDataDir);
    const ws = await registry.open(sub);

    const subReal = await fs.realpath(sub);
    expect(ws.root).toBe(subReal);
    expect(ws.name).toBe(path.basename(subReal)); // "deep"
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

  describe("createProject (auto-create)", () => {
    let projectsRoot: string;
    beforeEach(() => {
      projectsRoot = path.join(baseDir, "Grida");
    });

    it("mints a folder holding a `<name>.canvas` bundle, seeds an empty board, and registers it", async () => {
      const registry = new WorkspaceRegistry(userDataDir, projectsRoot);
      const ws = await registry.createProject({ name: "Poster" });

      // Folder lives under the managed root and is registered (recents).
      const rootReal = await fs.realpath(projectsRoot);
      expect(path.dirname(ws.root)).toBe(rootReal);
      expect(ws.name).toBe("Poster");
      expect(await registry.findById(ws.id)).not.toBeNull();

      // The manifest lives INSIDE a `<name>.canvas` bundle dir (so the tree
      // recognizes it as an openable board), NOT loose at the workspace root.
      const bundleName = `${path.basename(ws.root)}.canvas`;
      const rootEntries = await fs.readdir(ws.root);
      expect(rootEntries).toContain(bundleName);
      expect(rootEntries).not.toContain(".canvas.json"); // nothing loose at root
      const manifest = JSON.parse(
        await fs.readFile(
          path.join(ws.root, bundleName, ".canvas.json"),
          "utf8"
        )
      );
      expect(manifest.editor).toBe("board");
      expect(manifest.documents).toEqual([]);
    });

    it("seeds a picked reference as a first-class URI document", async () => {
      const registry = new WorkspaceRegistry(userDataDir, projectsRoot);
      const url = "https://library.grida.co/ref.png";
      const ws = await registry.createProject({
        name: "Sunset",
        seed: { documents: [{ src: url }] },
      });
      const bundleName = `${path.basename(ws.root)}.canvas`;
      const manifest = JSON.parse(
        await fs.readFile(
          path.join(ws.root, bundleName, ".canvas.json"),
          "utf8"
        )
      );
      expect(manifest.documents).toEqual([{ src: url }]);
    });

    it("suffixes -2, -3… on name collision (distinct folders + ids)", async () => {
      const registry = new WorkspaceRegistry(userDataDir, projectsRoot);
      const a = await registry.createProject({ name: "Poster" });
      const b = await registry.createProject({ name: "Poster" });
      expect(path.basename(a.root)).toBe("Poster");
      expect(path.basename(b.root)).toBe("Poster-2");
      expect(a.id).not.toBe(b.id);
    });

    it("slugifies a traversal name so it can never escape the managed root", async () => {
      const registry = new WorkspaceRegistry(userDataDir, projectsRoot);
      const ws = await registry.createProject({ name: "../../pwned" });
      const rootReal = await fs.realpath(projectsRoot);
      // The created folder is a single segment directly under the root — no
      // separator survived, so nothing landed outside.
      expect(path.dirname(await fs.realpath(ws.root))).toBe(rootReal);
      // And no sibling of the managed root was created.
      await expect(
        fs.stat(path.join(path.dirname(rootReal), "pwned"))
      ).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("degrades Windows-invalid punctuation to spaces instead of failing the create", async () => {
      const registry = new WorkspaceRegistry(userDataDir, projectsRoot);
      // `:` `?` `"` `<` `>` `|` `*` are invalid in a Windows path segment —
      // an ordinary prompt-derived name must still mint a folder.
      const ws = await registry.createProject({
        name: 'Logo: "coffee shop"? <v2> *|final*',
      });
      expect(path.basename(ws.root)).toBe("Logo coffee shop v2 final");
    });

    it("strips trailing dots (Windows-invalid) from the folder name", async () => {
      const registry = new WorkspaceRegistry(userDataDir, projectsRoot);
      const ws = await registry.createProject({ name: "Poster v2..." });
      expect(path.basename(ws.root)).toBe("Poster v2");
    });

    it("rolls back the minted directory when a downstream step fails", async () => {
      // Force the last step (registration via `open`) to fail — the mint must
      // be removed so no orphaned half-project squats the slug.
      class FailingRegistry extends WorkspaceRegistry {
        override async open(): Promise<Workspace> {
          throw new Error("boom");
        }
      }
      const registry = new FailingRegistry(userDataDir, projectsRoot);
      await expect(registry.createProject({ name: "Poster" })).rejects.toThrow(
        "boom"
      );
      await expect(
        fs.stat(path.join(projectsRoot, "Poster"))
      ).rejects.toMatchObject({ code: "ENOENT" });
      // The slug is free again: a healthy registry mints "Poster", not "-2".
      const healthy = new WorkspaceRegistry(userDataDir, projectsRoot);
      const ws = await healthy.createProject({ name: "Poster" });
      expect(path.basename(ws.root)).toBe("Poster");
    });

    it("throws projects-root-not-configured when no managed root is wired", async () => {
      const registry = new WorkspaceRegistry(userDataDir);
      await expect(registry.createProject({ name: "x" })).rejects.toThrow(
        "projects-root-not-configured"
      );
    });
  });
});
