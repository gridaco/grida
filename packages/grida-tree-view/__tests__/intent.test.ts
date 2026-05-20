import { describe, expect, it } from "vitest";
import type { TreeIntent } from "..";
import { buildFixture } from "./_helpers";

describe("InMemoryTreeSource.applyIntent", () => {
  it("applies a single-item move", () => {
    const src = buildFixture();
    const intent: TreeIntent = {
      kind: "move",
      items: ["a1"],
      to: { parent: "<root>", index: 1, placement: "after", over: "a" },
    };
    src.applyIntent(intent);
    expect(src.getNode("<root>").children).toEqual(["a", "a1", "b", "c"]);
    expect(src.getNode("a1").parent).toBe("<root>");
    expect(src.getNode("a").children).toEqual(["a2"]);
  });

  it("preserves original order across a multi-item move", () => {
    const src = buildFixture();
    // Move a1 and a2 (in document order) to be the last children of root.
    const intent: TreeIntent = {
      kind: "move",
      items: ["a1", "a2"],
      to: { parent: "<root>", index: 3, placement: "after", over: "c" },
    };
    src.applyIntent(intent);
    expect(src.getNode("<root>").children).toEqual(["a", "b", "c", "a1", "a2"]);
    expect(src.getNode("a").children).toEqual([]);
  });

  it("ignores `copy` intents", () => {
    const src = buildFixture();
    const before = src.getVersion();
    src.applyIntent({
      kind: "copy",
      items: ["a1"],
      to: { parent: "<root>", index: 0, placement: "before", over: "a" },
    });
    // copy is a no-op for the in-memory source — no version bump, no
    // topology change.
    expect(src.getVersion()).toBe(before);
    expect(src.getNode("<root>").children).toEqual(["a", "b", "c"]);
  });

  it("ignores rename / delete / activate intents", () => {
    const src = buildFixture();
    const before = src.getVersion();
    src.applyIntent({ kind: "rename", id: "a" });
    src.applyIntent({ kind: "delete", ids: ["a"] });
    src.applyIntent({ kind: "activate", id: "a" });
    expect(src.getVersion()).toBe(before);
  });
});
