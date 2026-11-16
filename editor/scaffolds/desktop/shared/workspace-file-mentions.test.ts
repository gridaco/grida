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

it("offers exact relative paths from this workspace", async () => {
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

  const mentions = await WorkspaceFileMentions.list(readdir, signal);
  expect(mentions.map(({ label, path }) => ({ label, path }))).toEqual([
    { label: "one/brief.txt", path: "one/brief.txt" },
    { label: "two/brief.txt", path: "two/brief.txt" },
  ]);
  expect(readdir.mock.calls).toEqual([[""], ["one"], ["two"]]);
});

it("does not return stale results or continue discovery after a workspace change", async () => {
  const owner = new AbortController();
  const root = Promise.withResolvers<WorkspaceFsEntry[]>();
  const readdir = vi.fn<WorkspaceArtifact.Readdir>(() => root.promise);
  const old = WorkspaceFileMentions.list(readdir, owner.signal);
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
    WorkspaceFileMentions.list(readdir, new AbortController().signal)
  ).resolves.toEqual([]);
  expect(readdir).toHaveBeenCalledTimes(64);
});
