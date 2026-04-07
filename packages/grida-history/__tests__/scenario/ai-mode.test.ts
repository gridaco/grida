import { HistoryImpl } from "../../src/history";
import { MockStore } from "../helpers/mock-store";

describe("Scenario: AI Mode", () => {
  it("AI writes 3 nodes in one atomic → undo reverts all 3", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("frame", "x", 0);
    store.set("text", "x", 0);
    store.set("image", "x", 0);

    h.atomic(
      "ai: layout",
      (tx) => {
        store.set("frame", "x", 100);
        tx.push(store.createDelta("frame", "x", 0, 100));
        store.set("text", "x", 20);
        tx.push(store.createDelta("text", "x", 0, 20));
        store.set("image", "x", 200);
        tx.push(store.createDelta("image", "x", 0, 200));
      },
      { origin: { type: "ai", agentId: "layout-agent" } }
    );

    expect(store.get("frame", "x")).toBe(100);
    expect(store.get("text", "x")).toBe(20);
    expect(store.get("image", "x")).toBe(200);

    await h.undo();
    expect(store.get("frame", "x")).toBe(0);
    expect(store.get("text", "x")).toBe(0);
    expect(store.get("image", "x")).toBe(0);
  });

  it("AI streams 10 changes → commit → undo reverts all", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();

    for (let i = 0; i < 10; i++) {
      store.set(`node${i}`, "style", "old");
    }

    const tx = h.begin("ai: restyle", {
      origin: { type: "ai", agentId: "style-agent" },
    });

    for (let i = 0; i < 10; i++) {
      const nodeId = `node${i}`;
      store.set(nodeId, "style", "new");
      tx.push(store.createDelta(nodeId, "style", "old", "new"));
    }

    tx.commit();
    expect(h.stack.pastCount).toBe(1);

    await h.undo();
    for (let i = 0; i < 10; i++) {
      expect(store.get(`node${i}`, "style")).toBe("old");
    }
  });

  it("AI stream fails midway → abort → all changes reverted", () => {
    const h = new HistoryImpl();
    const store = new MockStore();

    for (let i = 0; i < 5; i++) {
      store.set(`node${i}`, "color", "red");
    }

    const tx = h.begin("ai: recolor", {
      origin: { type: "ai", agentId: "color-agent" },
    });

    // Apply 3 changes
    for (let i = 0; i < 3; i++) {
      store.set(`node${i}`, "color", "blue");
      tx.push(store.createDelta(`node${i}`, "color", "red", "blue"));
    }

    // "Error" → abort
    tx.abort();

    // All reverted
    for (let i = 0; i < 3; i++) {
      expect(store.get(`node${i}`, "color")).toBe("red");
    }
    expect(h.stack.canUndo).toBe(false);
  });

  it("AI preview: accept → on stack → undo → reverted", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("bg", "color", "#fff");

    const preview = h.preview("ai: color suggestion");
    const original = store.get("bg", "color");
    preview.set({
      providerId: "document",
      apply: () => store.set("bg", "color", "#f0f"),
      revert: () => store.set("bg", "color", original),
    });

    expect(store.get("bg", "color")).toBe("#f0f");
    preview.commit();
    expect(h.stack.canUndo).toBe(true);

    await h.undo();
    expect(store.get("bg", "color")).toBe("#fff");
  });

  it("AI preview: reject → state unchanged", () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("bg", "color", "#fff");

    const preview = h.preview("ai: color suggestion");
    const original = store.get("bg", "color");
    preview.set({
      providerId: "document",
      apply: () => store.set("bg", "color", "#f0f"),
      revert: () => store.set("bg", "color", original),
    });

    preview.discard();
    expect(store.get("bg", "color")).toBe("#fff");
    expect(h.stack.canUndo).toBe(false);
  });
});
