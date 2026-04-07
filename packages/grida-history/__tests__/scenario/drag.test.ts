import { HistoryImpl } from "../../src/history";
import { MockStore } from "../helpers/mock-store";

describe("Scenario: Drag", () => {
  it("drag → undo → back to original → redo → at final", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("shape1", "x", 0);
    store.set("shape1", "y", 0);

    // Pointer down
    const tx = h.begin("move shape");
    const origX = store.get("shape1", "x");
    const origY = store.get("shape1", "y");

    // Pointer move (silent mutations)
    store.set("shape1", "x", 50);
    store.set("shape1", "y", 50);
    store.set("shape1", "x", 100);
    store.set("shape1", "y", 100);

    // Pointer up — push single delta
    const finalX = store.get("shape1", "x");
    const finalY = store.get("shape1", "y");
    tx.push(store.createDelta("shape1", "x", origX, finalX));
    tx.push(store.createDelta("shape1", "y", origY, finalY));
    tx.commit();

    expect(store.get("shape1", "x")).toBe(100);
    expect(store.get("shape1", "y")).toBe(100);

    // Undo
    await h.undo();
    expect(store.get("shape1", "x")).toBe(0);
    expect(store.get("shape1", "y")).toBe(0);

    // Redo
    await h.redo();
    expect(store.get("shape1", "x")).toBe(100);
    expect(store.get("shape1", "y")).toBe(100);
  });

  it("drag then cancel → state unchanged, stack empty", () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("shape1", "x", 0);

    const tx = h.begin("move shape");
    const orig = store.get("shape1", "x");

    // Pointer move
    store.set("shape1", "x", 100);

    // Cancel (Escape) — revert silently, abort tx
    store.set("shape1", "x", orig as number);
    tx.abort();

    expect(store.get("shape1", "x")).toBe(0);
    expect(h.stack.canUndo).toBe(false);
  });

  it("drag A then drag B → undo reverts B → undo reverts A", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("A", "x", 0);
    store.set("B", "x", 0);

    // Drag A
    const tx1 = h.begin("move A");
    store.set("A", "x", 100);
    tx1.push(store.createDelta("A", "x", 0, 100));
    tx1.commit();

    // Drag B
    const tx2 = h.begin("move B");
    store.set("B", "x", 200);
    tx2.push(store.createDelta("B", "x", 0, 200));
    tx2.commit();

    // Undo B
    await h.undo();
    expect(store.get("A", "x")).toBe(100);
    expect(store.get("B", "x")).toBe(0);

    // Undo A
    await h.undo();
    expect(store.get("A", "x")).toBe(0);
    expect(store.get("B", "x")).toBe(0);
  });

  it("drag with clone (nested tx) → undo reverts both", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("shape1", "x", 50);

    // Outer: drag-with-clone
    const outer = h.begin("drag with clone");

    // Inner: clone operation
    const inner = h.begin("clone");
    store.set("shape2", "x", 50); // clone at same position
    inner.push(store.createDelta("shape2", "x", undefined, 50));
    inner.commit();

    // Continue outer: translate clone
    store.set("shape2", "x", 200);
    outer.push(store.createDelta("shape2", "x", 50, 200));
    outer.commit();

    expect(store.get("shape2", "x")).toBe(200);

    // Undo reverts both clone and translate
    await h.undo();
    expect(store.get("shape2", "x")).toBe(undefined);
  });
});
