import { HistoryImpl } from "../../src/history";
import { MockStore } from "../helpers/mock-store";
import type { Delta } from "../../src/types";

function fontDelta(
  store: MockStore,
  nodeId: string,
  original: unknown,
  fontFamily: string
): Delta {
  return {
    providerId: "document",
    descriptor: {
      type: "set-font",
      nodeId,
      before: original,
      after: fontFamily,
    },
    apply: () => store.set(nodeId, "font", fontFamily),
    revert: () => store.set(nodeId, "font", original),
  };
}

describe("Scenario: Preview", () => {
  it("font picker: hover A, B, C, select C → undo → original", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("text1", "font", "Arial");

    const original = store.get("text1", "font");
    const preview = h.preview("change font");

    preview.set(fontDelta(store, "text1", original, "Helvetica"));
    expect(store.get("text1", "font")).toBe("Helvetica");

    preview.set(fontDelta(store, "text1", original, "Georgia"));
    expect(store.get("text1", "font")).toBe("Georgia");

    preview.set(fontDelta(store, "text1", original, "Roboto"));
    expect(store.get("text1", "font")).toBe("Roboto");

    preview.commit();
    expect(store.get("text1", "font")).toBe("Roboto");
    expect(h.stack.canUndo).toBe(true);

    await h.undo();
    expect(store.get("text1", "font")).toBe("Arial");
  });

  it("font picker: hover A, B, close picker → original, stack empty", () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("text1", "font", "Arial");

    const original = store.get("text1", "font");
    const preview = h.preview("change font");

    preview.set(fontDelta(store, "text1", original, "Helvetica"));
    preview.set(fontDelta(store, "text1", original, "Georgia"));
    preview.discard();

    expect(store.get("text1", "font")).toBe("Arial");
    expect(h.stack.canUndo).toBe(false);
  });

  it("slider: scrub 10 values, commit → one undo step", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("node1", "opacity", 0.5);

    const original = store.get("node1", "opacity");
    const preview = h.preview("adjust opacity");

    for (let i = 1; i <= 10; i++) {
      const val = i / 10;
      preview.set({
        providerId: "document",
        apply: () => store.set("node1", "opacity", val),
        revert: () => store.set("node1", "opacity", original),
      });
    }

    preview.commit();
    expect(store.get("node1", "opacity")).toBe(1.0); // last scrubbed value
    expect(h.stack.pastCount).toBe(1);

    await h.undo();
    expect(store.get("node1", "opacity")).toBe(0.5); // original
  });

  it("slider: scrub 10 values, cancel → original", () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("node1", "opacity", 1.0);

    const original = store.get("node1", "opacity");
    const preview = h.preview("adjust opacity");

    for (let i = 1; i <= 10; i++) {
      preview.set({
        providerId: "document",
        apply: () => store.set("node1", "opacity", i / 10),
        revert: () => store.set("node1", "opacity", original),
      });
    }

    preview.discard();
    expect(store.get("node1", "opacity")).toBe(1.0);
    expect(h.stack.canUndo).toBe(false);
  });

  it("preview active, then undo → preview discarded, previous op undone", async () => {
    const h = new HistoryImpl();
    const store = new MockStore();
    store.set("node1", "x", 0);
    store.set("node1", "font", "Arial");

    // First: commit a move
    h.atomic("move", (tx) => {
      store.set("node1", "x", 100);
      tx.push(store.createDelta("node1", "x", 0, 100));
    });

    // Start a font preview
    const preview = h.preview("font");
    preview.set(fontDelta(store, "node1", "Arial", "Georgia"));
    expect(store.get("node1", "font")).toBe("Georgia");

    // Undo — should discard preview first, then undo the move
    await h.undo();
    expect(store.get("node1", "font")).toBe("Arial"); // preview discarded
    expect(store.get("node1", "x")).toBe(0); // move undone
  });
});
