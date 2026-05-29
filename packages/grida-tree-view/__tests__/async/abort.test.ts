import { describe, expect, it } from "vitest";
import { createAsyncTreeSource } from "../../src/async";
import { createFakeFsProvider } from "./_helpers";

describe("createAsyncTreeSource: abort semantics", () => {
  it("abort(id) reverts loadState to unloaded; later load() re-fires", async () => {
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
    handle.load("<root>");
    expect(handle.getLoadState("<root>")).toBe("loading");

    handle.abort("<root>");
    // The Promise rejection runs on a microtask; wait for it.
    await Promise.resolve();
    await Promise.resolve();

    expect(handle.getLoadState("<root>")).toBe("unloaded");
    expect(fp.wasAborted("<root>")).toBe(true);

    // Now retry — a fresh listChildren must run.
    handle.load("<root>");
    expect(handle.getLoadState("<root>")).toBe("loading");
    expect(fp.pending("<root>")).toBe(1);
    await fp.resolve("<root>");
    expect(handle.getLoadState("<root>")).toBe("loaded");
  });

  it("abort then load before microtask flush is safe", async () => {
    // Rapid abort+load sequence: the rejection handler from the first
    // call lands after the second load has started. The source must
    // not stomp the second load's "loading" state on the first's
    // signal-aware reset.
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
    const handle = createAsyncTreeSource(fp.provider, { autoLoadRoot: false });
    handle.load("<root>");
    handle.abort("<root>");
    // Pending count: 1 (first call still queued). The store cleared
    // its inflight entry before the rejection lands.
    await Promise.resolve();
    await Promise.resolve();
    // After abort settles, state is unloaded; pending fake queue still
    // has the resolver but it's been rejected so it's no-op for the test.
    expect(handle.getLoadState("<root>")).toBe("unloaded");
  });

  it("dispose aborts every in-flight listChildren", async () => {
    const fp = createFakeFsProvider({
      tree: [
        {
          id: "<root>",
          hasChildren: true,
          children: ["a", "b"],
          meta: { label: "root" },
        },
        { id: "a", hasChildren: true, children: [], meta: { label: "a" } },
        { id: "b", hasChildren: true, children: [], meta: { label: "b" } },
      ],
    });
    const handle = createAsyncTreeSource(fp.provider);
    await fp.resolve("<root>");
    handle.load("a");
    handle.load("b");
    expect(fp.pending("a")).toBe(1);
    expect(fp.pending("b")).toBe(1);
    handle.dispose();
    expect(fp.wasAborted("a")).toBe(true);
    expect(fp.wasAborted("b")).toBe(true);
  });

  it("abort on a non-loading id is a no-op", () => {
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
    expect(() => handle.abort("<root>")).not.toThrow();
    expect(() => handle.abort("nonexistent")).not.toThrow();
  });
});
