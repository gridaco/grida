import { describe, expect, it, vi } from "vitest";
import { createAsyncTreeSource } from "../../src/async";
import { createFakeFsProvider } from "./_helpers";

describe("createAsyncTreeSource: load lifecycle", () => {
  it("auto-loads root on construction and transitions unloaded → loading → loaded", async () => {
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
    expect(handle.getLoadState("<root>")).toBe("loading");
    expect(fp.pending("<root>")).toBe(1);

    await fp.resolve("<root>");

    expect(handle.getLoadState("<root>")).toBe("loaded");
    expect(handle.source.getNode("<root>").children).toEqual(["a", "b"]);
    expect(handle.source.getNode("a").parent).toBe("<root>");
    expect(handle.source.getNode("a").meta).toEqual({ label: "a" });
  });

  it("skips root auto-load when autoLoadRoot: false", () => {
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
    const handle = createAsyncTreeSource(fp.provider, { autoLoadRoot: false });
    expect(handle.getLoadState("<root>")).toBe("unloaded");
    expect(fp.pending("<root>")).toBe(0);
  });

  it("treats leaves (hasChildren=false) at construction as fully loaded, no listing fires", () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: false,
          children: [],
          meta: { label: "root" },
        },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    expect(fp.pending("<root>")).toBe(0);
    expect(handle.getLoadState("<root>")).toBe("loaded");
  });

  it("transitions to error on rejection and surfaces the error", async () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: [],
          meta: { label: "root" },
        },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    const err = new Error("EPERM");
    await fp.reject("<root>", err);
    expect(handle.getLoadState("<root>")).toBe("error");
    expect(handle.getError("<root>")).toBe(err);
  });

  it("retry-after-error via load() re-fires listChildren", async () => {
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
    await fp.reject("<root>", new Error("first attempt"));
    expect(handle.getLoadState("<root>")).toBe("error");

    handle.load("<root>");
    expect(handle.getLoadState("<root>")).toBe("loading");
    await fp.resolve("<root>");
    expect(handle.getLoadState("<root>")).toBe("loaded");
    expect(handle.getError("<root>")).toBeNull();
  });

  it("load() is idempotent during loading and loaded states", async () => {
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
    // root already loading from auto-kick
    handle.load("<root>");
    handle.load("<root>");
    expect(fp.pending("<root>")).toBe(1); // no extra request

    await fp.resolve("<root>");
    handle.load("<root>"); // already loaded → no-op
    expect(fp.pending("<root>")).toBe(0);
  });

  it("getRootMeta seeds the root's adapted meta before the first listing", () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: [],
          meta: { label: "root-label" },
        },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider, { autoLoadRoot: false });
    expect(handle.source.getNode("<root>").meta).toEqual({
      label: "root-label",
    });
  });

  it("isContainer reports the hasChildren hint, not children.length", async () => {
    // A folder with no children yet (hasChildren=true) should still show
    // the chevron — testing the chevron-before-loading promise.
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: ["a"],
          meta: { label: "root" },
        },
        {
          id: "a",
          hasChildren: true, // claims to be a container...
          children: [], // ...but empty for now
          meta: { label: "a" },
        },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    await fp.resolve("<root>");
    expect(handle.source.isContainer!("a")).toBe(true);
    expect(handle.source.getNode("a").children).toEqual([]);
  });

  it("load success fires exactly one notification (folded mutate)", async () => {
    // Regression: previously commitListing's mutate notified once,
    // then a follow-up mutate to flip loadState notified again — 2x
    // re-runs per expand.
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
    const handle = createAsyncTreeSource(fp.provider, { autoLoadRoot: false });
    const versionBefore = handle.source.getVersion();
    const listener = vi.fn<() => void>();
    handle.source.subscribe(listener);
    handle.load("<root>");
    // The "loading" transition is one bump.
    const versionAfterLoadingFlip = handle.source.getVersion();
    expect(versionAfterLoadingFlip).toBe(versionBefore + 1);
    expect(listener).toHaveBeenCalledTimes(1);

    await fp.resolve("<root>");
    // The resolution should be exactly ONE more bump + notify.
    expect(handle.source.getVersion()).toBe(versionAfterLoadingFlip + 1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("getLoadState / getError / isContainer throw on unknown ids; hasNode probes safely", () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: [],
          meta: { label: "root" },
        },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    expect(handle.hasNode("<root>")).toBe(true);
    expect(handle.hasNode("not-a-thing")).toBe(false);
    expect(() => handle.getLoadState("not-a-thing")).toThrow(/unknown node/);
    expect(() => handle.getError("not-a-thing")).toThrow(/unknown node/);
    expect(() => handle.source.isContainer!("not-a-thing")).toThrow(
      /unknown node/
    );
    expect(() => handle.source.getNode("not-a-thing")).toThrow(/unknown node/);
  });

  it("showRoot option forwards to the produced TreeSource", () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: [],
          meta: { label: "root" },
        },
      ],
    });
    const withRoot = createAsyncTreeSource(fp.provider, { showRoot: true });
    expect(withRoot.source.showRoot!()).toBe(true);
    withRoot.dispose();

    const withoutRoot = createAsyncTreeSource(fp.provider);
    expect(withoutRoot.source.showRoot!()).toBe(false);
  });

  it("subscriber exceptions are isolated; later subscribers still fire", async () => {
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
    const handle = createAsyncTreeSource(fp.provider, { autoLoadRoot: false });

    const order: string[] = [];
    handle.source.subscribe(() => {
      order.push("first");
      throw new Error("first subscriber threw");
    });
    handle.source.subscribe(() => {
      order.push("second");
    });

    // Silence the expected console.error from the isolation handler.
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    handle.load("<root>");
    await fp.resolve("<root>");

    expect(order).toContain("first");
    expect(order).toContain("second");
    // Multiple notifications (loading flip + resolve) — each must
    // invoke BOTH subscribers despite the first throwing.
    expect(order.filter((s) => s === "first").length).toBeGreaterThanOrEqual(2);
    expect(order.filter((s) => s === "second").length).toBeGreaterThanOrEqual(
      2
    );

    consoleSpy.mockRestore();
  });

  it("dispose aborts in-flight loads and clears records", async () => {
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
    expect(fp.pending("<root>")).toBe(1);
    handle.dispose();
    expect(fp.wasAborted("<root>")).toBe(true);
  });
});
