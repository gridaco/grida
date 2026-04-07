import { HistoryImpl } from "../../src/history";
import { MockStore } from "../helpers/mock-store";
import { counterDelta } from "../helpers";

describe("Scenario: Interleaved operations", () => {
  it("undo during open tx → returns false → abort → undo succeeds", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("n", "x", 0);

    // Commit something first
    h.atomic("edit", (tx) => {
      store.set("n", "x", 100);
      tx.push(store.createDelta("n", "x", 0, 100));
    });

    // Open a drag transaction
    const drag = h.begin("drag");

    // Try to undo — blocked
    expect(h.undo()).toBe(false);

    // Abort drag
    drag.abort();

    // Now undo succeeds
    await h.undo();
    expect(store.get("n", "x")).toBe(0);
  });

  it("rapid undo/redo 10x → final state consistent", async () => {
    const h = new HistoryImpl();
    const c = { value: 0 };

    // Push 5 items: value goes 0 → 10 → 20 → 30 → 40 → 50
    for (let i = 1; i <= 5; i++) {
      h.atomic(`step ${i}`, (tx) => {
        const d = counterDelta(c, 10);
        d.apply();
        tx.push(d);
      });
    }
    expect(c.value).toBe(50);

    // Undo all
    for (let i = 0; i < 5; i++) {
      await h.undo();
    }
    expect(c.value).toBe(0);

    // Redo all
    for (let i = 0; i < 5; i++) {
      await h.redo();
    }
    expect(c.value).toBe(50);
  });

  it("nested tx: inner abort → push to outer → commit → undo", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("a", "v", 0);
    store.set("b", "v", 0);

    const outer = h.begin("outer");

    // Inner: try something, abort
    const inner = h.begin("inner");
    store.set("b", "v", 999);
    inner.push(store.createDelta("b", "v", 0, 999));
    inner.abort();
    expect(store.get("b", "v")).toBe(0); // reverted

    // Push to outer
    store.set("a", "v", 42);
    outer.push(store.createDelta("a", "v", 0, 42));
    outer.commit();

    expect(store.get("a", "v")).toBe(42);
    expect(h.stack.pastCount).toBe(1);

    await h.undo();
    expect(store.get("a", "v")).toBe(0);
  });

  it("clearsFuture:false → edit → undo → select → redo → edit restored", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("n", "x", 0);
    store.set("sel", "ids", "none");

    // Edit
    h.atomic("move", (tx) => {
      store.set("n", "x", 100);
      tx.push(store.createDelta("n", "x", 0, 100));
    });

    // Undo
    await h.undo();
    expect(store.get("n", "x")).toBe(0);
    expect(h.stack.canRedo).toBe(true);

    // Selection change (clearsFuture: false)
    h.atomic(
      "select",
      (tx) => {
        store.set("sel", "ids", "node1");
        tx.push(store.createDelta("sel", "ids", "none", "node1"));
      },
      { clearsFuture: false }
    );

    expect(h.stack.canRedo).toBe(true);

    // Redo the edit
    await h.redo();
    expect(store.get("n", "x")).toBe(100);
  });
});
