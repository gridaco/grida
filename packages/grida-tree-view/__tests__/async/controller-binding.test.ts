import { describe, expect, it } from "vitest";
import { TreeController } from "../../src/controller";
import {
  bindAsyncTreeController,
  createAsyncTreeSource,
} from "../../src/async";
import { createFakeFsProvider } from "./_helpers";

describe("bindAsyncTreeController", () => {
  it("triggers load when a node is expanded with unloaded children", async () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: ["a"],
          meta: { label: "root" },
        },
        { id: "a", hasChildren: true, children: ["a1"], meta: { label: "a" } },
        { id: "a1", hasChildren: false, children: [], meta: { label: "a1" } },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    await fp.resolve("<root>");
    const controller = new TreeController({ source: handle.source });
    const unbind = bindAsyncTreeController(controller, handle);

    expect(handle.getLoadState("a")).toBe("unloaded");
    controller.expand("a");
    expect(handle.getLoadState("a")).toBe("loading");
    expect(fp.pending("a")).toBe(1);
    await fp.resolve("a");
    expect(handle.getLoadState("a")).toBe("loaded");
    expect(handle.source.getNode("a").children).toEqual(["a1"]);

    unbind();
  });

  it("aborts the in-flight listChildren when the node is collapsed mid-load", async () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: ["a"],
          meta: { label: "root" },
        },
        { id: "a", hasChildren: true, children: [], meta: { label: "a" } },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    await fp.resolve("<root>");
    const controller = new TreeController({ source: handle.source });
    bindAsyncTreeController(controller, handle);

    controller.expand("a");
    expect(handle.getLoadState("a")).toBe("loading");
    controller.collapse("a");
    await Promise.resolve();
    await Promise.resolve();
    expect(handle.getLoadState("a")).toBe("unloaded");
    expect(fp.wasAborted("a")).toBe(true);
  });

  it("expanding a leaf does not fire listChildren", async () => {
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
    const controller = new TreeController({ source: handle.source });
    bindAsyncTreeController(controller, handle);

    controller.expand("a");
    // "a" has hasChildren=false → controller's expanded set still adds it,
    // but the binding's load() check sees loadState already "loaded"
    // (leaves are auto-loaded at construction) → no call.
    // Actually: the load() check skips already-loaded ids. Verify no
    // listChildren fired.
    expect(fp.pending("a")).toBe(0);
  });

  it("expanded ids at bind time are loaded immediately", async () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: ["a"],
          meta: { label: "root" },
        },
        { id: "a", hasChildren: true, children: [], meta: { label: "a" } },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    await fp.resolve("<root>");
    const controller = new TreeController({
      source: handle.source,
      expanded: ["a"],
    });
    bindAsyncTreeController(controller, handle);
    expect(handle.getLoadState("a")).toBe("loading");
    expect(fp.pending("a")).toBe(1);
  });
});
