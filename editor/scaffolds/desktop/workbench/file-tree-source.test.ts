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
      meta: { ...file, bundle: false },
    });
    expect(WorkspaceFileTree.toEntry(dir)).toEqual({
      id: "src",
      hasChildren: true,
      meta: { ...dir, bundle: false },
    });
  });

  it("treats a `.canvas` directory as an opaque bundle (a leaf, not a folder)", () => {
    const bundle: WorkspaceFsEntry = {
      name: "intro.canvas",
      rel_path: "decks/intro.canvas",
      kind: "directory",
    };
    // A bundle is physically a directory but never listed: no children, flagged.
    expect(WorkspaceFileTree.toEntry(bundle)).toEqual({
      id: "decks/intro.canvas",
      hasChildren: false,
      meta: { ...bundle, bundle: true },
    });
    // A plain file ending in `.canvas` is NOT a bundle (only directories are).
    expect(
      WorkspaceFileTree.isBundle({
        name: "notes.canvas",
        rel_path: "notes.canvas",
        kind: "file",
      })
    ).toBe(false);
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
      bundle: false,
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

  it("never marks a listed `.canvas` bundle as an expandable container", async () => {
    const entries: WorkspaceFsEntry[] = [
      { name: "deck.canvas", rel_path: "deck.canvas", kind: "directory" },
      { name: "src", rel_path: "src", kind: "directory" },
    ];
    const provider = WorkspaceFileTree.createProvider({
      rootName: "project",
      readdir: async () => entries,
    });

    await provider.listChildren("", new AbortController().signal);

    // The real folder is expandable; the bundle is not (kept out of the
    // provider's known-directories set, same opaque-package rule as `toEntry`).
    expect(provider.hasChildren("src")).toBe(true);
    expect(provider.hasChildren("deck.canvas")).toBe(false);
  });
});
