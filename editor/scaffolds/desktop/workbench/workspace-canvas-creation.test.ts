import { describe, expect, it } from "vitest";
import { dotcanvas } from "dotcanvas";
import { WorkspaceCanvasCreation } from "./workspace-canvas-creation";

class FakeClient implements WorkspaceCanvasCreation.Client {
  readonly files = new Map<string, string>();

  constructor(private readonly names: string[] = []) {}

  async readdir() {
    return this.names.map((name) => ({
      name,
      rel_path: name,
      kind: "directory" as const,
    }));
  }

  async readFile(_workspaceId: string, relPath: string) {
    const content = this.files.get(relPath);
    if (content === undefined) throw new Error("not found");
    return { content };
  }

  async writeFile(_workspaceId: string, relPath: string, content: string) {
    this.files.set(relPath, content);
    return { mtime: 1 };
  }
}

describe("WorkspaceCanvasCreation.nextPath", () => {
  it("starts with the unsuffixed Untitled name", () => {
    expect(WorkspaceCanvasCreation.nextPath([])).toBe("Untitled.canvas");
  });

  it("fills the first available numbered name case-insensitively", () => {
    expect(
      WorkspaceCanvasCreation.nextPath([
        "UNTITLED.CANVAS",
        "Untitled 2.canvas",
        "notes.md",
      ])
    ).toBe("Untitled 3.canvas");
  });

  it("fills a gap instead of always appending the largest suffix", () => {
    expect(
      WorkspaceCanvasCreation.nextPath(["Untitled.canvas", "Untitled 3.canvas"])
    ).toBe("Untitled 2.canvas");
  });
});

describe("WorkspaceCanvasCreation.create", () => {
  it.each([
    ["board", "Untitled.canvas"],
    ["slides", "Untitled 2.canvas"],
  ] as const)(
    "writes and returns a new %s bundle",
    async (editor, expected) => {
      const client = new FakeClient(
        editor === "slides" ? ["Untitled.canvas"] : []
      );

      await expect(
        WorkspaceCanvasCreation.create("workspace", editor, client)
      ).resolves.toBe(expected);
      expect(
        client.files.get(`${expected}/${dotcanvas.MANIFEST_FILENAME}`)
      ).toBe(dotcanvas.serialize({ editor, documents: [] }));
    }
  );
});
