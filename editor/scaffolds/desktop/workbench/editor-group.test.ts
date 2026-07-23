import { describe, expect, it, vi } from "vitest";
import { EditorGroup } from "./editor-group";

const snap = (g: EditorGroup) => {
  const s = g.getSnapshot();
  return { tabs: [...s.tabs], active: s.active };
};

describe("EditorGroup — open / activate", () => {
  it("opens tabs left-to-right and focuses each new one", () => {
    const g = new EditorGroup();
    g.open("a");
    g.open("b");
    expect(snap(g)).toEqual({ tabs: ["a", "b"], active: "b" });
  });

  it("opening an already-open tab focuses it without duplicating", () => {
    const g = new EditorGroup();
    g.open("a");
    g.open("b");
    g.open("a");
    expect(snap(g)).toEqual({ tabs: ["a", "b"], active: "a" });
  });

  it("re-opening the already-active tab is a no-op (no notify)", () => {
    const g = new EditorGroup();
    g.open("a");
    const listener = vi.fn<() => void>();
    g.subscribe(listener);
    g.open("a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("snapshot identity is stable across a no-op open", () => {
    const g = new EditorGroup();
    g.open("a");
    const before = g.getSnapshot();
    g.open("a");
    expect(g.getSnapshot()).toBe(before);
  });

  it("activate focuses an open tab; ignores unknown or already-active", () => {
    const g = new EditorGroup();
    g.open("a");
    g.open("b");
    g.activate("a");
    expect(snap(g).active).toBe("a");
    const listener = vi.fn<() => void>();
    g.subscribe(listener);
    g.activate("a"); // already active
    g.activate("nope"); // not open
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("EditorGroup — restore", () => {
  it("restores ordered tabs and their active tab in one mutation", () => {
    const g = new EditorGroup();
    const listener = vi.fn<() => void>();
    g.subscribe(listener);

    g.restore({ tabs: ["a", "b", "c"], active: "b" });

    expect(snap(g)).toEqual({ tabs: ["a", "b", "c"], active: "b" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("deduplicates tabs and falls back to the last tab for an invalid active id", () => {
    const g = new EditorGroup();

    g.restore({ tabs: ["a", "b", "a"], active: "missing" });

    expect(snap(g)).toEqual({ tabs: ["a", "b"], active: "b" });
  });

  it("clears the live-session reopen history", () => {
    const g = new EditorGroup();
    g.open("old");
    g.close("old");

    g.restore({ tabs: ["restored"], active: "restored" });
    g.reopenClosed();

    expect(snap(g)).toEqual({
      tabs: ["restored"],
      active: "restored",
    });
  });
});

describe("EditorGroup — close (VSCode neighbor rule)", () => {
  it("closing the active tab focuses the LEFT neighbor", () => {
    const g = new EditorGroup();
    g.open("a");
    g.open("b");
    g.open("c");
    g.activate("b");
    g.close("b");
    expect(snap(g)).toEqual({ tabs: ["a", "c"], active: "a" });
  });

  it("closing the first (active) tab falls back to the RIGHT neighbor", () => {
    const g = new EditorGroup();
    g.open("a");
    g.open("b");
    g.activate("a");
    g.close("a");
    expect(snap(g)).toEqual({ tabs: ["b"], active: "b" });
  });

  it("closing the only tab clears the active tab to null", () => {
    const g = new EditorGroup();
    g.open("a");
    g.close("a");
    expect(snap(g)).toEqual({ tabs: [], active: null });
  });

  it("closing a non-active tab leaves the active tab untouched", () => {
    const g = new EditorGroup();
    g.open("a");
    g.open("b");
    g.activate("b");
    g.close("a");
    expect(snap(g)).toEqual({ tabs: ["b"], active: "b" });
  });

  it("closing an unknown tab is a no-op", () => {
    const g = new EditorGroup();
    g.open("a");
    const listener = vi.fn<() => void>();
    g.subscribe(listener);
    g.close("nope");
    expect(listener).not.toHaveBeenCalled();
    expect(snap(g)).toEqual({ tabs: ["a"], active: "a" });
  });
});

describe("EditorGroup — closeMatching (trash subtree)", () => {
  it("closes a whole folder subtree and focuses nearest surviving left tab", () => {
    const g = new EditorGroup();
    for (const t of ["a.txt", "dir/x", "dir/y", "b.txt"]) g.open(t);
    g.activate("dir/y");
    g.closeMatching((t) => t === "dir" || t.startsWith("dir/"));
    expect(snap(g)).toEqual({ tabs: ["a.txt", "b.txt"], active: "a.txt" });
  });

  it("falls back to the leftmost survivor when no left survivor exists", () => {
    const g = new EditorGroup();
    for (const t of ["dir/x", "dir/y", "b.txt"]) g.open(t);
    g.activate("dir/x");
    g.closeMatching((t) => t.startsWith("dir/"));
    expect(snap(g)).toEqual({ tabs: ["b.txt"], active: "b.txt" });
  });

  it("leaves the active tab untouched when it isn't affected", () => {
    const g = new EditorGroup();
    for (const t of ["a", "dir/x", "b"]) g.open(t);
    g.activate("b");
    g.closeMatching((t) => t.startsWith("dir/"));
    expect(snap(g)).toEqual({ tabs: ["a", "b"], active: "b" });
  });

  it("is a no-op when nothing matches", () => {
    const g = new EditorGroup();
    g.open("a");
    const listener = vi.fn<() => void>();
    g.subscribe(listener);
    g.closeMatching((t) => t === "nope");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("EditorGroup — reopen-closed history", () => {
  it("reopens the most-recently closed tab", () => {
    const g = new EditorGroup();
    g.open("a");
    g.open("b");
    g.close("a");
    g.close("b");
    g.reopenClosed();
    expect(snap(g).tabs).toContain("b");
    expect(snap(g).active).toBe("b");
  });

  it("skips entries already reopened by hand", () => {
    const g = new EditorGroup();
    g.open("a");
    g.close("a");
    g.open("a"); // reopened manually
    g.reopenClosed(); // stack top ("a") is already open → nothing to do
    expect(snap(g)).toEqual({ tabs: ["a"], active: "a" });
  });

  it("does nothing when the history is empty", () => {
    const g = new EditorGroup();
    g.open("a");
    const listener = vi.fn<() => void>();
    g.subscribe(listener);
    g.reopenClosed();
    expect(listener).not.toHaveBeenCalled();
  });

  it("never records a transient tab for reopen", () => {
    const g = new EditorGroup();
    g.open("a");
    g.open("virtual://picker");
    g.close("virtual://picker");
    g.close("a");
    g.reopenClosed(); // only "a" is in history
    expect(snap(g)).toEqual({ tabs: ["a"], active: "a" });
  });

  it("bounds the history to the configured limit", () => {
    const g = new EditorGroup(undefined, 2);
    for (const t of ["a", "b", "c"]) {
      g.open(t);
      g.close(t);
    }
    // history holds only the last two closes: c, b. "a" fell off.
    g.reopenClosed();
    expect(snap(g).active).toBe("c");
    g.reopenClosed();
    expect(snap(g).active).toBe("b");
    g.reopenClosed(); // "a" is gone
    expect(snap(g).tabs).toEqual(["c", "b"]);
  });
});

describe("EditorGroup — ephemeral (preview) tab", () => {
  const ID = "virtual://design-search";

  it("a new key opens + focuses the ephemeral tab", () => {
    const g = new EditorGroup();
    g.open("a");
    g.syncEphemeral(ID, "call-1");
    expect(snap(g)).toEqual({ tabs: ["a", ID], active: ID });
  });

  it("a null key closes it and restores the left neighbor", () => {
    const g = new EditorGroup();
    g.open("a");
    g.syncEphemeral(ID, "call-1");
    g.syncEphemeral(ID, null);
    expect(snap(g)).toEqual({ tabs: ["a"], active: "a" });
  });

  it("the same key does not reopen after a manual close (rising edge)", () => {
    const g = new EditorGroup();
    g.open("a");
    g.syncEphemeral(ID, "call-1");
    g.close(ID); // user closes the picker tab
    g.syncEphemeral(ID, "call-1"); // same pending pick — must stay closed
    expect(snap(g)).toEqual({ tabs: ["a"], active: "a" });
  });

  it("a new, distinct key reopens after a manual close", () => {
    const g = new EditorGroup();
    g.open("a");
    g.syncEphemeral(ID, "call-1");
    g.close(ID);
    g.syncEphemeral(ID, "call-2"); // fresh pick
    expect(snap(g).active).toBe(ID);
  });

  it("closing the ephemeral tab never lands it in the reopen history", () => {
    const g = new EditorGroup();
    g.open("a");
    g.syncEphemeral(ID, "call-1");
    g.syncEphemeral(ID, null); // closed via null key
    g.reopenClosed();
    expect(snap(g).tabs).not.toContain(ID);
  });
});
