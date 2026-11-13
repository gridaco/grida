import type { WorkspaceFsEntry } from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import type { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import { WorkspaceFileMentions } from "./workspace-file-mentions";

const entry = (
  path: string,
  kind: WorkspaceFsEntry["kind"] = "file"
): WorkspaceFsEntry => ({
  name: path.slice(path.lastIndexOf("/") + 1),
  rel_path: path,
  kind,
});

it("offers exact relative paths from this workspace and preserves the compatibility catalog", async () => {
  const children: Record<string, WorkspaceFsEntry[]> = {
    "": [
      entry("one", "directory"),
      entry("two", "directory"),
      entry("node_modules", "directory"),
      entry(".git", "directory"),
      entry("outside.txt", "symlink"),
      entry("/absolute.txt"),
      entry("../outside.txt"),
      entry("two/foreign.txt"),
      entry("line\nbreak.txt"),
    ],
    one: [entry("one/brief.txt")],
    two: [entry("two/brief.txt")],
  };
  const readdir = vi.fn<WorkspaceArtifact.Readdir>(
    async (path) => children[path] ?? []
  );
  const { signal } = new AbortController();

  const native = await WorkspaceFileMentions.list(readdir, signal, "native");
  expect(native.map(({ label, path }) => ({ label, path }))).toEqual([
    { label: "one/brief.txt", path: "one/brief.txt" },
    { label: "two/brief.txt", path: "two/brief.txt" },
  ]);
  expect(readdir.mock.calls).toEqual([[""], ["one"], ["two"]]);

  const compatibility = await WorkspaceFileMentions.list(
    readdir,
    signal,
    "compatibility"
  );
  expect(compatibility.map(({ label, path }) => ({ label, path }))).toEqual([
    { label: "brief.txt", path: "one/brief.txt" },
    { label: "brief.txt", path: "two/brief.txt" },
    { label: "outside.txt", path: "outside.txt" },
  ]);
});

it("does not return stale results or continue discovery after a workspace change", async () => {
  const owner = new AbortController();
  const root = Promise.withResolvers<WorkspaceFsEntry[]>();
  const readdir = vi.fn<WorkspaceArtifact.Readdir>(() => root.promise);
  const old = WorkspaceFileMentions.list(readdir, owner.signal, "native");
  owner.abort();
  root.resolve([entry("old.txt"), entry("old", "directory")]);

  await expect(old).resolves.toEqual([]);
  expect(readdir.mock.calls).toEqual([[""]]);
});

it("bounds discovery even in a wide workspace with no files", async () => {
  const readdir = vi.fn<WorkspaceArtifact.Readdir>(async (path) =>
    path === ""
      ? Array.from({ length: 1024 }, (_, index) =>
          entry(`folder-${index}`, "directory")
        )
      : []
  );

  await expect(
    WorkspaceFileMentions.list(readdir, new AbortController().signal, "native")
  ).resolves.toEqual([]);
  expect(readdir).toHaveBeenCalledTimes(64);
});

it("keeps the compatibility catalog bounded by depth and file count only", async () => {
  const folders = 100;
  const readdir = vi.fn<WorkspaceArtifact.Readdir>(async (path) =>
    path === ""
      ? Array.from({ length: folders }, (_, index) =>
          entry(`folder-${index}`, "directory")
        )
      : Array.from({ length: 10 }, (_, index) => entry(`${path}/${index}.txt`))
  );
  const signal = new AbortController().signal;

  const compatibility = await WorkspaceFileMentions.list(
    readdir,
    signal,
    "compatibility"
  );
  // Files beyond the 64th folder are listed, and the walk stops at 800 files.
  expect(compatibility).toHaveLength(800);
  expect(compatibility.some(({ path }) => path === "folder-79/9.txt")).toBe(
    true
  );
  expect(readdir).toHaveBeenCalledTimes(81);

  readdir.mockClear();
  const native = await WorkspaceFileMentions.list(readdir, signal, "native");
  expect(native).toHaveLength(630);
  expect(readdir).toHaveBeenCalledTimes(64);
});
