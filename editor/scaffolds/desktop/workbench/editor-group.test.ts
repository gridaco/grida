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

describe("EditorGroup — replace", () => {
  it("replaces the active tab at its index with one atomic publication", () => {
    const g = new EditorGroup();
    g.restore({ tabs: ["a", "b", "c"], active: "b" });
    const previous = g.getSnapshot();
    const published: ReturnType<typeof snap>[] = [];
    g.subscribe(() => published.push(snap(g)));

    expect(g.replace("b", "replacement")).toBe(true);

    expect(snap(g)).toEqual({
      tabs: ["a", "replacement", "c"],
      active: "replacement",
    });
    expect(published).toEqual([
      { tabs: ["a", "replacement", "c"], active: "replacement" },
    ]);
    expect(previous).toEqual({ tabs: ["a", "b", "c"], active: "b" });
  });

  it("keeps the active selection when replacing an inactive tab", () => {
    const g = new EditorGroup();
    g.restore({ tabs: ["a", "b", "c"], active: "c" });
    expect(g.replace("b", "replacement")).toBe(true);
    expect(snap(g)).toEqual({ tabs: ["a", "replacement", "c"], active: "c" });
  });

  it("preserves unrelated reopen history and never records the replaced source", () => {
    const g = new EditorGroup();
    g.open("historic");
    g.close("historic");
    g.open("source");
    expect(g.replace("source", "replacement")).toBe(true);

    g.reopenClosed();
    expect(snap(g)).toEqual({
      tabs: ["replacement", "historic"],
      active: "historic",
    });
    g.reopenClosed();
    expect(snap(g)).toEqual({
      tabs: ["replacement", "historic"],
      active: "historic",
    });
  });

  it("leaves earlier legitimate close records unchanged", () => {
    const g = new EditorGroup();
    g.open("source");
    g.close("source");
    g.open("source");
    g.replace("source", "replacement");
    g.reopenClosed();
    expect(snap(g)).toEqual({
      tabs: ["replacement", "source"],
      active: "source",
    });
  });

  it("accepts the same existing identity without changing the snapshot", () => {
    const g = new EditorGroup();
    g.open("a");
    const before = g.getSnapshot();
    const listener = vi.fn<() => void>();
    g.subscribe(listener);
    expect(g.replace("a", "a")).toBe(true);
    expect(g.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("refuses missing sources and collisions without mutating or publishing", () => {
    const g = new EditorGroup();
    g.restore({ tabs: ["a", "b"], active: "a" });
    const before = g.getSnapshot();
    const listener = vi.fn<() => void>();
    g.subscribe(listener);
    expect(g.replace("missing", "fresh")).toBe(false);
    expect(g.replace("missing", "missing")).toBe(false);
    expect(g.replace("a", "b")).toBe(false);
    expect(g.getSnapshot()).toBe(before);
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

  it("bounds the history to the configured limit", () => {
    const g = new EditorGroup({ historyLimit: 2 });
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

describe("EditorGroup — reopenable policy", () => {
  it("never records a tab the policy rejects", () => {
    const g = new EditorGroup({ reopenable: (id) => id !== "panel" });
    g.open("a");
    g.open("panel");
    g.close("a");
    g.close("panel");
    g.reopenClosed();
    expect(snap(g)).toEqual({ tabs: ["a"], active: "a" });
    g.reopenClosed();
    expect(snap(g)).toEqual({ tabs: ["a"], active: "a" });
  });

  it("applies the neighbor rule to a closed non-reopenable tab", () => {
    const g = new EditorGroup({ reopenable: (id) => id !== "panel" });
    g.open("a");
    g.open("panel");
    g.open("b");
    g.activate("panel");
    g.close("panel");
    expect(snap(g)).toEqual({ tabs: ["a", "b"], active: "a" });
  });
});
