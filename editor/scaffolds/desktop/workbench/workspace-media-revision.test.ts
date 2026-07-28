import { describe, expect, it } from "vitest";
import { WorkspaceMediaRevision } from "./workspace-media-revision";

describe("WorkspaceMediaRevision.matches", () => {
  it("matches any change kind for the exact media path", () => {
    for (const kind of ["added", "changed", "deleted"] as const) {
      expect(
        WorkspaceMediaRevision.matches(
          [{ kind, rel_path: "renders/latest.png" }],
          "renders/latest.png"
        )
      ).toBe(true);
    }
  });

  it("does not match sibling or parent changes", () => {
    expect(
      WorkspaceMediaRevision.matches(
        [
          { kind: "changed", rel_path: "renders" },
          { kind: "changed", rel_path: "renders/other.png" },
        ],
        "renders/latest.png"
      )
    ).toBe(false);
  });
});

describe("WorkspaceMediaRevision.url", () => {
  it("changes the request identity without changing the workspace path", () => {
    expect(
      WorkspaceMediaRevision.url(
        "grida-workspace://workspace/ws/renders/latest.png",
        3
      )
    ).toBe("grida-workspace://workspace/ws/renders/latest.png?revision=3");
  });

  it("preserves existing query parameters", () => {
    expect(
      WorkspaceMediaRevision.url(
        "grida-workspace://workspace/ws/latest.png?transport=test",
        4
      )
    ).toBe(
      "grida-workspace://workspace/ws/latest.png?transport=test&revision=4"
    );
  });
});
