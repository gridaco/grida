import { describe, expect, it } from "vitest";
import { WorkspaceFileRevision } from "./workspace-file-revision";

describe("WorkspaceFileRevision.next", () => {
  it("advances once for any change kind at an exact path", () => {
    for (const kind of ["added", "changed", "deleted"] as const) {
      expect(
        WorkspaceFileRevision.next(
          4,
          WorkspaceFileRevision.exact("renders/latest.png"),
          [{ kind, rel_path: "renders/latest.png" }]
        )
      ).toBe(5);
    }
  });

  it("keeps an exact revision stable for sibling or parent changes", () => {
    expect(
      WorkspaceFileRevision.next(
        4,
        WorkspaceFileRevision.exact("renders/latest.png"),
        [
          { kind: "changed", rel_path: "renders" },
          { kind: "changed", rel_path: "renders/other.png" },
        ]
      )
    ).toBe(4);
  });

  it("matches a bundle root and its descendants without prefix collisions", () => {
    const scope = WorkspaceFileRevision.subtree("deck.canvas/");
    expect(
      WorkspaceFileRevision.next(0, scope, [
        { kind: "changed", rel_path: "deck.canvas/assets/fill.png" },
        { kind: "changed", rel_path: "deck.canvas/slides/001.svg" },
      ])
    ).toBe(1);
    expect(
      WorkspaceFileRevision.next(1, scope, [
        { kind: "changed", rel_path: "deck.canvas-copy/assets/fill.png" },
      ])
    ).toBe(1);
    expect(
      WorkspaceFileRevision.next(1, scope, [
        { kind: "deleted", rel_path: "deck.canvas" },
      ])
    ).toBe(2);
  });

  it("treats an empty subtree as the workspace root", () => {
    expect(
      WorkspaceFileRevision.next(2, WorkspaceFileRevision.subtree(""), [
        { kind: "added", rel_path: "assets/fill.png" },
      ])
    ).toBe(3);
  });

  it("matches only declared projection dependencies", () => {
    const scope = WorkspaceFileRevision.paths([
      "deck.canvas/assets/fill.png",
      "deck.canvas/assets/logo.svg",
    ]);
    expect(
      WorkspaceFileRevision.next(7, scope, [
        { kind: "changed", rel_path: "deck.canvas/assets/fill.png" },
      ])
    ).toBe(8);
    expect(
      WorkspaceFileRevision.next(8, scope, [
        { kind: "changed", rel_path: "deck.canvas/assets/other.png" },
      ])
    ).toBe(8);
  });

  it("advances only once for a coalesced batch with several dependencies", () => {
    expect(
      WorkspaceFileRevision.next(
        10,
        WorkspaceFileRevision.subtree("deck.canvas"),
        [
          { kind: "changed", rel_path: "deck.canvas/assets/a.png" },
          { kind: "changed", rel_path: "deck.canvas/assets/b.png" },
        ]
      )
    ).toBe(11);
  });

  it("reports whether a batch changes a dependency scope", () => {
    const scope = WorkspaceFileRevision.paths(["board.canvas/assets/fill.png"]);
    expect(
      WorkspaceFileRevision.changed(scope, [
        { kind: "changed", rel_path: "board.canvas/.canvas.json" },
      ])
    ).toBe(false);
    expect(
      WorkspaceFileRevision.changed(scope, [
        { kind: "deleted", rel_path: "board.canvas/assets/fill.png" },
      ])
    ).toBe(true);
  });

  it("uses the bundle while dependencies are unknown, then narrows exactly", () => {
    const assetChange = [
      { kind: "changed", rel_path: "deck.canvas/assets/fill.png" },
    ] as const;

    expect(
      WorkspaceFileRevision.changed(
        WorkspaceFileRevision.dependencies("deck.canvas", null),
        assetChange
      )
    ).toBe(true);
    expect(
      WorkspaceFileRevision.changed(
        WorkspaceFileRevision.dependencies("deck.canvas", []),
        assetChange
      )
    ).toBe(false);
  });
});

describe("WorkspaceFileRevision.url", () => {
  it("changes the request identity without changing the workspace path", () => {
    expect(
      WorkspaceFileRevision.url(
        "grida-workspace://workspace/ws/renders/latest.png",
        3
      )
    ).toBe("grida-workspace://workspace/ws/renders/latest.png?revision=3");
  });

  it("preserves existing query parameters", () => {
    expect(
      WorkspaceFileRevision.url(
        "grida-workspace://workspace/ws/latest.png?transport=test",
        4
      )
    ).toBe(
      "grida-workspace://workspace/ws/latest.png?transport=test&revision=4"
    );
  });

  it("gives an overwritten board pin a new request identity", () => {
    const source =
      "grida-workspace://workspace/ws/board.canvas/assets/fill.png";
    const scope = WorkspaceFileRevision.paths(["board.canvas/assets/fill.png"]);
    const revision = WorkspaceFileRevision.next(0, scope, [
      { kind: "changed", rel_path: "board.canvas/assets/fill.png" },
    ]);

    expect(WorkspaceFileRevision.url(source, 0)).not.toBe(
      WorkspaceFileRevision.url(source, revision)
    );
    expect(revision).toBe(1);
  });
});
