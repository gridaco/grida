import { describe, expect, it } from "vitest";
import { createAsyncTreeSource } from "../../src/async";
import { createFakeFsProvider } from "./_helpers";

describe("createAsyncTreeSource: reference stability (FEEDBACKS F1)", () => {
  it("getNode returns the same reference across unrelated version bumps", async () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: ["a", "b"],
          meta: { label: "root" },
        },
        { id: "a", hasChildren: false, children: [], meta: { label: "a" } },
        { id: "b", hasChildren: false, children: [], meta: { label: "b" } },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    await fp.resolve("<root>");
    const aBefore = handle.source.getNode("a");
    // Change b's meta — a's adapted node should not be rebuilt.
    fp.emit([{ type: "changed", id: "b", meta: { label: "B!" } }]);
    const aAfter = handle.source.getNode("a");
    expect(aAfter).toBe(aBefore);
  });

  it("rebuilds the adapted node when its own meta changes", async () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: ["a"],
          meta: { label: "root" },
        },
        { id: "a", hasChildren: false, children: [], meta: { label: "a" } },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    await fp.resolve("<root>");
    const aBefore = handle.source.getNode("a");
    fp.emit([{ type: "changed", id: "a", meta: { label: "A!" } }]);
    const aAfter = handle.source.getNode("a");
    expect(aAfter).not.toBe(aBefore);
    expect(aAfter.meta).toEqual({ label: "A!" });
  });

  it("rebuilds the parent's adapted node when children list changes", async () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: ["a"],
          meta: { label: "root" },
        },
        { id: "a", hasChildren: false, children: [], meta: { label: "a" } },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    await fp.resolve("<root>");
    const rootBefore = handle.source.getNode("<root>");
    fp.emit([
      {
        type: "created",
        parent: "<root>",
        entry: { id: "b", hasChildren: false, meta: { label: "b" } },
      },
    ]);
    const rootAfter = handle.source.getNode("<root>");
    expect(rootAfter).not.toBe(rootBefore);
    expect(rootAfter.children).toEqual(["a", "b"]);
  });

  it("a no-op change event does not bump version", async () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: ["a"],
          meta: { label: "root" },
        },
        { id: "a", hasChildren: false, children: [], meta: { label: "a" } },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    await fp.resolve("<root>");
    const aMeta = handle.source.getNode("a").meta;
    const versionBefore = handle.source.getVersion();
    // Same reference — store should detect and skip the rebuild.
    fp.emit([{ type: "changed", id: "a", meta: aMeta! }]);
    expect(handle.source.getVersion()).toBe(versionBefore);
  });
});
