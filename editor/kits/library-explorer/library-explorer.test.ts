import { describe, expect, it } from "vitest";
import { LibraryExplorer, type LibraryExplorerItem } from "./library-explorer";

const item = (id: string): LibraryExplorerItem => ({
  id,
  title: `Reference ${id}`,
  url: `https://example.com/${id}.png`,
  width: 1200,
  height: 800,
  mime: "image/png",
});

const scroll = (scrollTop: number, anchorId: string | null = null) => ({
  scrollTop,
  anchorId,
  anchorOffset: -12,
});

describe("LibraryExplorer", () => {
  it("navigates nested similar feeds and restores each prior entry", () => {
    const explorer = new LibraryExplorer({ kind: "browse" });
    explorer.open(item("a"), scroll(420, "a"), 100);
    explorer.open(item("b"), scroll(760, "b"), 100);

    expect(explorer.getSnapshot().current.route).toEqual({
      kind: "object",
      object: item("b"),
      source: { kind: "similar", objectId: "b" },
    });

    expect(explorer.back(scroll(900))).toBe(true);
    expect(explorer.getSnapshot().current.route).toEqual({
      kind: "object",
      object: item("a"),
      source: { kind: "similar", objectId: "a" },
    });
    expect(explorer.getSnapshot().current.state.scroll).toEqual(
      scroll(760, "b")
    );
    expect(explorer.getSnapshot().current.state.focusId).toBe("b");

    expect(explorer.back(scroll(800))).toBe(true);
    expect(explorer.getSnapshot().current.route).toEqual({
      kind: "feed",
      source: { kind: "browse" },
    });
    expect(explorer.getSnapshot().current.state.scroll).toEqual(
      scroll(420, "a")
    );
    expect(explorer.getSnapshot().current.state.focusId).toBe("a");
  });

  it("keeps loaded pages with their navigation entry", () => {
    const explorer = new LibraryExplorer({ kind: "search", query: "poster" });
    const first = explorer.startLoad(0, 1, false)!;
    explorer.finishLoad(first, {
      items: [item("a"), item("b")],
      exactCount: 4,
    });
    const second = explorer.startLoad(2, 3, true)!;
    explorer.finishLoad(second, {
      items: [item("b"), item("c")],
      exactCount: 4,
    });

    expect(
      explorer.getSnapshot().current.state.items.map((value) => value.id)
    ).toEqual(["a", "b", "c"]);

    explorer.open(item("a"), scroll(200, "a"), 0);
    explorer.back(scroll(0));
    expect(
      explorer.getSnapshot().current.state.items.map((value) => value.id)
    ).toEqual(["a", "b", "c"]);
  });

  it("does not push the object that is already open", () => {
    const explorer = new LibraryExplorer({ kind: "browse" });
    explorer.open(item("a"), scroll(200, "a"), 0);
    const current = explorer.getSnapshot();

    explorer.open(item("a"), scroll(400, "a"), 100);

    expect(explorer.getSnapshot()).toBe(current);
    expect(explorer.back(scroll(0))).toBe(true);
    expect(explorer.getSnapshot().current.route).toEqual({
      kind: "feed",
      source: { kind: "browse" },
    });
  });

  it("rejects a late page after navigating elsewhere", () => {
    const explorer = new LibraryExplorer({ kind: "browse" });
    const late = explorer.startLoad(0, 29, false)!;
    explorer.open(item("a"), scroll(120, "a"), 0);

    expect(
      explorer.finishLoad(late, {
        items: [item("late")],
        exactCount: 1,
      })
    ).toBe(false);
    expect(explorer.getSnapshot().current.state.items).toEqual([]);
  });

  it("lets a cached entry retry a page rejected while it was hidden", () => {
    const explorer = new LibraryExplorer({ kind: "browse" });
    const first = explorer.startLoad(0, 0, false)!;
    explorer.finishLoad(first, { items: [item("a")], exactCount: 10 });
    const hiddenPage = explorer.startLoad(1, 1, true)!;

    explorer.open(item("a"), scroll(120, "a"), 0);
    expect(
      explorer.finishLoad(hiddenPage, {
        items: [item("late")],
        exactCount: 10,
      })
    ).toBe(false);

    explorer.back(scroll(0));
    expect(explorer.getSnapshot().current.state.loadingMore).toBe(false);
    expect(explorer.startLoad(1, 1, true)).not.toBeNull();
  });

  it("marks a short or final page exhausted", () => {
    const explorer = new LibraryExplorer({ kind: "browse" });
    const ticket = explorer.startLoad(0, 29, false)!;
    explorer.finishLoad(ticket, {
      items: [item("a")],
      exactCount: undefined,
    });

    expect(explorer.getSnapshot().current.state.exhausted).toBe(true);
    expect(explorer.startLoad(1, 30, true)).toBeNull();
  });

  it("loads a one-item inclusive tail without dropping the corpus end", () => {
    const explorer = new LibraryExplorer({ kind: "browse" });
    const firstItems = Array.from({ length: 30 }, (_, index) =>
      item(String(index))
    );
    const first = explorer.startLoad(0, 29, false)!;
    explorer.finishLoad(first, { items: firstItems, exactCount: 31 });

    expect(explorer.getSnapshot().current.state.exhausted).toBe(false);
    const tail = explorer.startLoad(30, 30, true)!;
    expect(tail.range).toEqual([30, 30]);
    explorer.finishLoad(tail, {
      items: [item("30")],
      exactCount: 31,
    });

    expect(explorer.getSnapshot().current.state.items).toHaveLength(31);
    expect(explorer.getSnapshot().current.state.exhausted).toBe(true);
    expect(() => explorer.startLoad(31, 30, true)).toThrow(RangeError);
  });

  it("retries the exact failed initial or append range", () => {
    const explorer = new LibraryExplorer({ kind: "browse" });
    const initial = explorer.startLoad(0, 29, false)!;
    explorer.failLoad(initial);

    expect(explorer.getSnapshot().current.state.phase).toBe("error");
    const initialRetry = explorer.retryLoad()!;
    expect(initialRetry).toMatchObject({
      range: [0, 29],
      append: false,
    });
    explorer.finishLoad(initialRetry, {
      items: Array.from({ length: 30 }, (_, index) => item(String(index))),
      exactCount: undefined,
    });

    const append = explorer.startLoad(30, 59, true)!;
    explorer.failLoad(append);
    expect(explorer.getSnapshot().current.state.phase).toBe("ready");
    expect(explorer.getSnapshot().current.state.failedLoad).toEqual({
      range: [30, 59],
      append: true,
    });

    const appendRetry = explorer.retryLoad()!;
    expect(appendRetry).toMatchObject({
      range: [30, 59],
      append: true,
    });
    expect(explorer.getSnapshot().current.state.failedLoad).toBeNull();
  });
});
