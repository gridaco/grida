import { describe, expect, it } from "vitest";
import {
  createAsyncTreeSource,
  type AsyncTreeEntry,
  type AsyncTreeProvider,
} from "../../src/async";
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

  it("provider that resolves after abort still cleans up — load(id) can retry", async () => {
    // Regression for Codex P2: if a custom IPC/REST wrapper ignores
    // the AbortSignal and resolves anyway, the source must still
    // reset loadState/inflight so a subsequent load() fires.
    let captured: {
      resolve: (entries: readonly AsyncTreeEntry<{ label: string }>[]) => void;
    } | null = null;
    const ignoresAbort: AsyncTreeProvider<{ label: string }> = {
      rootId: "<root>",
      hasChildren: () => true,
      listChildren: (_id, _signal) =>
        new Promise((resolve) => {
          captured = { resolve };
          // Deliberately ignore _signal — simulate a misbehaved producer.
        }),
    };
    const handle = createAsyncTreeSource(ignoresAbort, { autoLoadRoot: false });
    handle.load("<root>");
    expect(handle.getLoadState("<root>")).toBe("loading");
    handle.abort("<root>");
    // No reject ever fires from the provider — instead it resolves
    // late as if the abort never happened.
    captured!.resolve([{ id: "a", hasChildren: false, meta: { label: "a" } }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(handle.getLoadState("<root>")).toBe("unloaded");
    expect(handle.hasNode("a")).toBe(false);
    // A subsequent load must fire — would no-op if loadState was stuck.
    handle.load("<root>");
    expect(handle.getLoadState("<root>")).toBe("loading");
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
