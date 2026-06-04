import { describe, expect, it } from "vitest";
import type { WorkspaceFsEntry } from "@grida/desktop-bridge";
import { WorkspaceFileTree } from "./file-tree-source";

describe("WorkspaceFileTree", () => {
  it("maps workspace fs entries to async tree entries", () => {
    const file: WorkspaceFsEntry = {
      name: "app.tsx",
      rel_path: "src/app.tsx",
      kind: "file",
    };
    const dir: WorkspaceFsEntry = {
      name: "src",
      rel_path: "src",
      kind: "directory",
    };

    expect(WorkspaceFileTree.toEntry(file)).toEqual({
      id: "src/app.tsx",
      hasChildren: false,
      meta: file,
    });
    expect(WorkspaceFileTree.toEntry(dir)).toEqual({
      id: "src",
      hasChildren: true,
      meta: dir,
    });
  });

  it("computes parent rel paths with the empty root id", () => {
    expect(WorkspaceFileTree.parentRelPath("README.md")).toBe("");
    expect(WorkspaceFileTree.parentRelPath("src/app/page.tsx")).toBe("src/app");
    expect(WorkspaceFileTree.parentRelPath("/src/app/")).toBe("src");
    expect(WorkspaceFileTree.parentRelPath("")).toBe("");
  });

  it("creates an async provider over workspace readdir", async () => {
    const calls: string[] = [];
    const entries: WorkspaceFsEntry[] = [
      { name: "src", rel_path: "src", kind: "directory" },
      { name: "README.md", rel_path: "README.md", kind: "file" },
    ];
    const provider = WorkspaceFileTree.createProvider({
      rootName: "project",
      readdir: async (relPath) => {
        calls.push(relPath);
        return entries;
      },
    });

    expect(provider.rootId).toBe("");
    expect(provider.hasChildren("")).toBe(true);
    expect(provider.getRootMeta?.()).toEqual({
      name: "project",
      rel_path: "",
      kind: "directory",
    });

    const listed = await provider.listChildren(
      "",
      new AbortController().signal
    );

    expect(calls).toEqual([""]);
    expect(listed).toEqual(entries.map(WorkspaceFileTree.toEntry));
    expect(provider.hasChildren("src")).toBe(true);
    expect(provider.hasChildren("README.md")).toBe(false);
  });
});
