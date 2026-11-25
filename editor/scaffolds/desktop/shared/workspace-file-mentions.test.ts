import type {
  WorkspaceFsEntry,
  WorkspacePathMatch,
} from "@grida/desktop-bridge";
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

it("uses the ranked native results, preserving full paths and empty results", async () => {
  const readdir = vi.fn<WorkspaceArtifact.Readdir>();
  const search =
    vi.fn<(query: string) => Promise<WorkspacePathMatch[] | null>>();
  search
    .mockResolvedValueOnce([
      { path: "z/cover@2x.png", kind: "file" },
      { path: "a/cover drafts", kind: "directory" },
    ])
    .mockResolvedValueOnce([]);
  const lookup = WorkspaceFileMentions.source(readdir, search);
  const { signal } = new AbortController();
  await expect(lookup("cover", signal)).resolves.toEqual([
    {
      id: "z/cover@2x.png",
      label: "z/cover@2x.png",
      path: "z/cover@2x.png",
      kind: "file",
    },
    {
      id: "a/cover drafts",
      label: "a/cover drafts",
      path: "a/cover drafts",
      kind: "folder",
    },
  ]);
  await expect(lookup("nothing", signal)).resolves.toEqual([]);
  expect(readdir).not.toHaveBeenCalled();
});

it("retains the directory fallback when a shell lacks native search", async () => {
  const readdir = vi
    .fn<WorkspaceArtifact.Readdir>()
    .mockResolvedValue([entry("first.md"), entry("second.md")]);
  const search = vi.fn<(query: string) => Promise<null>>(async () => null);
  const lookup = WorkspaceFileMentions.source(readdir, search);
  const { signal } = new AbortController();
  await expect(lookup("first", signal)).resolves.toMatchObject([
    { path: "first.md" },
  ]);
  await expect(lookup("second", signal)).resolves.toMatchObject([
    { path: "second.md" },
  ]);
  expect(search).toHaveBeenCalledTimes(1);
  expect(readdir).toHaveBeenCalledTimes(1);
});

it("offers exact relative paths for workspace files and folders", async () => {
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
  expect(mentions.map(({ kind, path }) => ({ kind, path }))).toEqual([
    { kind: "folder", path: "one" },
    { kind: "file", path: "one/brief.txt" },
    { kind: "folder", path: "two" },
    { kind: "file", path: "two/brief.txt" },
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

  const mentions = await WorkspaceFileMentions.list(
    readdir,
    new AbortController().signal
  );
  expect(mentions).toHaveLength(63);
  expect(mentions.every(({ kind }) => kind === "folder")).toBe(true);
  expect(readdir).toHaveBeenCalledTimes(64);
});
