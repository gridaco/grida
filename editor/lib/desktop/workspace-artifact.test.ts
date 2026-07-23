import { describe, expect, it, vi } from "vitest";
import { WorkspaceArtifact } from "./workspace-artifact";

describe("WorkspaceArtifact paths", () => {
  it("maps canonical agent paths to relative Desktop paths and back", () => {
    expect(WorkspaceArtifact.fromAgentPath("/decks/Launch.canvas")).toBe(
      "decks/Launch.canvas"
    );
    expect(WorkspaceArtifact.toAgentPath("decks/Launch.canvas")).toBe(
      "/decks/Launch.canvas"
    );
  });

  it.each([
    "",
    "/",
    "relative.svg",
    "//double.svg",
    "/trailing/",
    "/a//b.svg",
    "/a/./b.svg",
    "/a/../b.svg",
    "/a\\b.svg",
    "/a\0b.svg",
  ])("rejects unsafe or non-canonical agent path %j", (path) => {
    expect(WorkspaceArtifact.fromAgentPath(path)).toBeNull();
  });

  it("resolves only an exact direct child from the authoritative listing", async () => {
    const readdir = vi.fn<WorkspaceArtifact.Readdir>(async () => [
      {
        name: "Launch.canvas",
        rel_path: "decks/Launch.canvas",
        kind: "directory",
      },
      {
        name: "nearby.svg",
        rel_path: "decks/nearby.svg",
        kind: "file",
      },
    ]);

    await expect(
      WorkspaceArtifact.find(readdir, "decks/Launch.canvas")
    ).resolves.toEqual({
      name: "Launch.canvas",
      rel_path: "decks/Launch.canvas",
      kind: "directory",
    });
    expect(readdir).toHaveBeenCalledWith("decks");
  });
});

describe("WorkspaceArtifact.isOpenable", () => {
  it("accepts files and `.canvas` bundle directories", () => {
    expect(
      WorkspaceArtifact.isOpenable({
        name: "brief.md",
        rel_path: "brief.md",
        kind: "file",
      })
    ).toBe(true);
    expect(
      WorkspaceArtifact.isOpenable({
        name: "Deck.Canvas",
        rel_path: "decks/Deck.Canvas",
        kind: "directory",
      })
    ).toBe(true);
  });

  it("rejects plain directories and non-file entries", () => {
    expect(
      WorkspaceArtifact.isOpenable({
        name: "assets",
        rel_path: "assets",
        kind: "directory",
      })
    ).toBe(false);
    expect(
      WorkspaceArtifact.isOpenable({
        name: "linked.svg",
        rel_path: "linked.svg",
        kind: "symlink",
      })
    ).toBe(false);
  });
});
