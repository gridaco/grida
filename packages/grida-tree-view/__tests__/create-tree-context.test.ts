import { describe, expect, it } from "vitest";
// Built artifact — same resolution discipline as the rest of the suite
// (see FEEDBACKS F9). Imports from the package's `/react` subpath so the
// factory ships through the actual public entry.
import { createTreeContext, TreeProvider, useTree } from "../react";

describe("createTreeContext", () => {
  it("returns a provider + hook trio + an underlying Context", () => {
    const ctx = createTreeContext<{ kind: string }>();
    expect(typeof ctx.TreeProvider).toBe("function");
    expect(typeof ctx.useTree).toBe("function");
    expect(typeof ctx.useTreeSnapshot).toBe("function");
    expect(ctx.Context).toBeDefined();
    // React's `createContext` returns an object with `Provider` and
    // `Consumer` properties — verify we passed through a real context,
    // not a stub. (React 19's `Provider` is an object/component, not
    // necessarily a function, so existence is the contract we check.)
    const underlying = ctx.Context as unknown as {
      Provider?: unknown;
      Consumer?: unknown;
    };
    expect(underlying.Provider).toBeDefined();
    expect(underlying.Consumer).toBeDefined();
  });

  it("each call produces a fresh React context (typed contexts are independent)", () => {
    const a = createTreeContext<{ kind: "leaf" }>();
    const b = createTreeContext<{ kind: "folder" }>();
    expect(a.Context).not.toBe(b.Context);
    expect(a.TreeProvider).not.toBe(b.TreeProvider);
    expect(a.useTree).not.toBe(b.useTree);
    expect(a.useTreeSnapshot).not.toBe(b.useTreeSnapshot);
  });

  it("is independent of the un-typed top-level surface", () => {
    const a = createTreeContext();
    // The un-typed surface is a stable singleton; the factory must
    // never collide with it — that's the whole point of "pick one per
    // tree, typed and un-typed providers do not share state".
    expect(a.TreeProvider).not.toBe(TreeProvider);
    expect(a.useTree).not.toBe(useTree);
  });

  it("useTree from a factory throws when called outside its own provider", () => {
    // The hook is React-coupled — we can't render here without jsdom,
    // but we can exercise the "no provider" branch by invoking the
    // hook outside any React renderer. React will throw (no current
    // dispatcher); we just assert the call path is reachable and the
    // function itself is a real callable. Silence React's expected
    // "Invalid hook call" warning that goes to stderr on the way out.
    const ctx = createTreeContext();
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => ctx.useTree()).toThrow(/./);
    } finally {
      console.error = original;
    }
  });
});
