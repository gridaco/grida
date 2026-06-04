import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `workspace-files.ts` imports `shell` from electron for `trashWorkspaceEntry`.
// We only exercise the pure containment resolver here, so a thin mock keeps
// the module importable outside an Electron runtime.
vi.mock("electron", () => ({
  shell: { trashItem: vi.fn<(path: string) => Promise<void>>() },
}));

import { resolveContainedEntry, WorkspaceFileError } from "./workspace-files";

// base/
//   root/                 ← the "workspace"
//     file.txt
//     sub/nested.txt
//     dir/                ← a directory
//     link-inside.txt  -> root/file.txt        (symlink, target inside)
//     link-escape.txt  -> base/outside/secret  (symlink, target outside)
//   outside/secret.txt    ← sibling, outside the workspace
let base: string;
let root: string;

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "grida-trash-test-"));
  root = path.join(base, "root");
  await fs.mkdir(path.join(root, "sub"), { recursive: true });
  await fs.mkdir(path.join(root, "dir"), { recursive: true });
  await fs.mkdir(path.join(base, "outside"), { recursive: true });
  await fs.writeFile(path.join(root, "file.txt"), "hello");
  await fs.writeFile(path.join(root, "sub", "nested.txt"), "nested");
  await fs.writeFile(path.join(base, "outside", "secret.txt"), "secret");
  await fs.symlink(
    path.join(root, "file.txt"),
    path.join(root, "link-inside.txt")
  );
  await fs.symlink(
    path.join(base, "outside", "secret.txt"),
    path.join(root, "link-escape.txt")
  );
});

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

describe("resolveContainedEntry", () => {
  it("resolves a regular file to its canonical path", async () => {
    const resolved = await resolveContainedEntry(root, "file.txt");
    expect(resolved).toBe(await fs.realpath(path.join(root, "file.txt")));
  });

  it("resolves a nested file", async () => {
    const resolved = await resolveContainedEntry(root, "sub/nested.txt");
    expect(resolved).toBe(
      await fs.realpath(path.join(root, "sub", "nested.txt"))
    );
  });

  it("resolves a directory (folders are trashable)", async () => {
    const resolved = await resolveContainedEntry(root, "dir");
    expect(resolved).toBe(await fs.realpath(path.join(root, "dir")));
  });

  it("follows an in-workspace symlink whose target is also inside", async () => {
    const resolved = await resolveContainedEntry(root, "link-inside.txt");
    expect(resolved).toBe(await fs.realpath(path.join(root, "file.txt")));
  });

  it("rejects a symlink that escapes the workspace", async () => {
    await expect(
      resolveContainedEntry(root, "link-escape.txt")
    ).rejects.toMatchObject({ code: "path-escapes-workspace" });
  });

  it("rejects a `..` traversal", async () => {
    await expect(
      resolveContainedEntry(root, "../outside/secret.txt")
    ).rejects.toMatchObject({ code: "path-escapes-workspace" });
  });

  it("rejects an absolute path", async () => {
    const err = await resolveContainedEntry(
      root,
      path.join(base, "outside", "secret.txt")
    ).catch((e) => e);
    expect(err).toBeInstanceOf(WorkspaceFileError);
    expect(err.code).toBe("path-not-relative");
  });

  it("rejects an empty path", async () => {
    await expect(resolveContainedEntry(root, "")).rejects.toMatchObject({
      code: "path-not-relative",
    });
  });

  it("rejects a path with a null byte", async () => {
    await expect(
      resolveContainedEntry(root, "file.txt\0.png")
    ).rejects.toMatchObject({ code: "path-not-relative" });
  });

  it("rejects the workspace root itself (`.`)", async () => {
    await expect(resolveContainedEntry(root, ".")).rejects.toMatchObject({
      code: "is-workspace-root",
    });
  });

  it("rejects a `..` chain that resolves back to the root", async () => {
    await expect(resolveContainedEntry(root, "sub/..")).rejects.toMatchObject({
      code: "is-workspace-root",
    });
  });

  it("propagates ENOENT for a missing entry", async () => {
    await expect(resolveContainedEntry(root, "nope.txt")).rejects.toThrow(
      /ENOENT/
    );
  });
});
