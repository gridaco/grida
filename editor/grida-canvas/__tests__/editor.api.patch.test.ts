import { editor } from "../editor.i";

describe("patch API helpers", () => {
  it("encodes json pointer segments", () => {
    expect(editor.api.patch.encodeJsonPointerSegment("a~b/c")).toBe("a~0b~1c");
    expect(editor.api.patch.encodeJsonPointerSegment(42)).toBe("42");
  });

  it("builds json pointer paths", () => {
    expect(
      editor.api.patch.toJsonPointerPath(["document", "nodes", 0, "name"])
    ).toBe("/document/nodes/0/name");
  });

  it("converts immer patches to json patch operations", () => {
    const patches: editor.history.Patch[] = [
      {
        op: "replace",
        path: ["document", "scenes", "scene", "name"],
        value: "Renamed",
      },
      {
        op: "remove",
        path: ["document", "properties", "obsolete"],
      },
    ];

    expect(editor.api.patch.toJsonPatchOperations(patches)).toEqual([
      {
        op: "replace",
        path: "/document/scenes/scene/name",
        value: "Renamed",
      },
      {
        op: "remove",
        path: "/document/properties/obsolete",
      },
    ]);
  });
});
