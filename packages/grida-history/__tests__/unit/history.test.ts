import { HistoryImpl } from "../../src/history";
import { __resetTransactionIdCounter } from "../../src/transaction";
import { __resetPreviewIdCounter } from "../../src/preview";
import {
  counterDelta,
  failingRevertDelta,
} from "../helpers";
import { MockProvider } from "../helpers/mock-provider";
import type { CommittedTransaction } from "../../src/types";

beforeEach(() => {
  __resetTransactionIdCounter();
  __resetPreviewIdCounter();
});

describe("History", () => {
  describe("Invariant 2: undo blocked during open transaction", () => {
    it("undo returns false while tx open", () => {
      const h = new HistoryImpl();
      h.begin("test");
      expect(h.undo()).toBe(false);
    });

    it("undo succeeds after commit", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      const tx = h.begin("test");
      const d = counterDelta(c, 10);
      d.apply();
      tx.push(d);
      tx.commit();
      expect(c.value).toBe(10);
      const result = await h.undo();
      expect(result).toBe(true);
      expect(c.value).toBe(0);
    });
  });

  describe("Invariant 3: preview discarded before undo", () => {
    it("active preview is discarded on undo", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };

      // Push something to undo
      h.atomic("set", (tx) => {
        const d = counterDelta(c, 10);
        d.apply();
        tx.push(d);
      });
      expect(c.value).toBe(10);

      // Start a preview
      const preview = h.preview("font");
      preview.set({
        providerId: "test",
        apply: () => {
          c.value = 99;
        },
        revert: () => {
          c.value = 10;
        },
      });
      expect(c.value).toBe(99);

      // Undo — should discard preview first, then undo
      const result = await h.undo();
      expect(result).toBe(true);
      expect(c.value).toBe(0);
    });
  });

  describe("Invariant 7: record:false", () => {
    it("does not push to stack", () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      h.atomic(
        "remote",
        (tx) => {
          const d = counterDelta(c, 10);
          d.apply();
          tx.push(d);
        },
        { record: false }
      );
      expect(c.value).toBe(10);
      expect(h.stack.canUndo).toBe(false);
    });

    it("fires onChange", () => {
      const h = new HistoryImpl();
      const events: CommittedTransaction[] = [];
      h.on("onChange", (tx) => events.push(tx));

      h.atomic(
        "remote",
        (tx) => {
          tx.push(counterDelta({ value: 0 }, 1));
        },
        { record: false }
      );

      expect(events.length).toBe(1);
    });
  });

  describe("Invariant 9: prepare() dispatch", () => {
    it("calls prepare on registered provider", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      const provider = new MockProvider("doc");
      h.register(provider);

      h.atomic("edit", (tx) => {
        const d = counterDelta(c, 10, "doc");
        d.apply();
        tx.push(d);
      });

      await h.undo();
      expect(provider.prepareCalls).toBe(1);
      expect(provider.disposeCalls).toBe(1);
    });

    it("calls prepare on both providers in multi-provider tx", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      const p1 = new MockProvider("doc");
      const p2 = new MockProvider("text");
      h.register(p1);
      h.register(p2);

      h.atomic("edit", (tx) => {
        const d1 = counterDelta(c, 10, "doc");
        d1.apply();
        tx.push(d1);
        const d2 = counterDelta(c, 5, "text");
        d2.apply();
        tx.push(d2);
      });

      await h.undo();
      expect(p1.prepareCalls).toBe(1);
      expect(p2.prepareCalls).toBe(1);
    });

    it("unregistered providerId does not crash", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      h.atomic("edit", (tx) => {
        const d = counterDelta(c, 10, "unknown-provider");
        d.apply();
        tx.push(d);
      });
      const result = await h.undo();
      expect(result).toBe(true);
      expect(c.value).toBe(0);
    });
  });

  describe("Invariant 11: serialized undo/redo", () => {
    it("sequential execution with async prepare", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      const provider = new MockProvider("doc");
      provider.prepareDelay = 10;
      h.register(provider);

      // Push two items
      h.atomic("a", (tx) => {
        const d = counterDelta(c, 10, "doc");
        d.apply();
        tx.push(d);
      });
      h.atomic("b", (tx) => {
        const d = counterDelta(c, 5, "doc");
        d.apply();
        tx.push(d);
      });

      // Fire both undos nearly simultaneously
      const r1 = h.undo();
      const r2 = h.undo();

      expect(await r1).toBe(true);
      expect(await r2).toBe(true);
      expect(c.value).toBe(0);
    });
  });

  describe("Invariant 13: delta failure during undo", () => {
    it("emits onError and removes tx from stack", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      const errors: unknown[] = [];
      h.on("onError", (_tx, err) => errors.push(err));

      // Push a tx with a failing revert in the middle
      const tx = h.begin("test");
      const d1 = counterDelta(c, 10);
      d1.apply();
      tx.push(d1);

      c.value = 10;
      const dFail = failingRevertDelta(c, 5);
      dFail.apply();
      tx.push(dFail);

      c.value = 15;
      const d3 = counterDelta(c, 3);
      d3.apply();
      tx.push(d3);

      tx.commit();
      expect(c.value).toBe(18);

      const result = await h.undo();
      expect(result).toBe(false);
      expect(errors.length).toBe(1);
      // d3 reverted (18→15), dFail failed, d1 skipped
      expect(c.value).toBe(15);
      // tx should be removed from stack
      expect(h.stack.canUndo).toBe(false);
    });
  });

  describe("Events", () => {
    it("commit fires onChange", () => {
      const h = new HistoryImpl();
      const events: string[] = [];
      h.on("onChange", () => events.push("change"));
      h.atomic("test", (tx) => tx.push(counterDelta({ value: 0 }, 1)));
      expect(events).toEqual(["change"]);
    });

    it("undo fires onUndo and onChange", async () => {
      const h = new HistoryImpl();
      const events: string[] = [];
      h.on("onChange", () => events.push("change"));
      h.on("onUndo", () => events.push("undo"));

      const c = { value: 0 };
      h.atomic("test", (tx) => {
        const d = counterDelta(c, 1);
        d.apply();
        tx.push(d);
      });
      events.length = 0;

      await h.undo();
      expect(events).toEqual(["undo", "change"]);
    });

    it("redo fires onRedo and onChange", async () => {
      const h = new HistoryImpl();
      const events: string[] = [];
      h.on("onChange", () => events.push("change"));
      h.on("onRedo", () => events.push("redo"));

      const c = { value: 0 };
      h.atomic("test", (tx) => {
        const d = counterDelta(c, 1);
        d.apply();
        tx.push(d);
      });
      await h.undo();
      events.length = 0;

      await h.redo();
      expect(events).toEqual(["redo", "change"]);
    });
  });

  describe("atomic()", () => {
    it("fn runs, deltas committed", () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      h.atomic("test", (tx) => {
        const d = counterDelta(c, 10);
        d.apply();
        tx.push(d);
      });
      expect(c.value).toBe(10);
      expect(h.stack.canUndo).toBe(true);
    });

    it("fn throws → deltas reverted, nothing on stack", () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      expect(() => {
        h.atomic("test", (tx) => {
          const d = counterDelta(c, 10);
          d.apply();
          tx.push(d);
          throw new Error("oops");
        });
      }).toThrow("oops");
      expect(c.value).toBe(0);
      expect(h.stack.canUndo).toBe(false);
    });

    it("fn pushes zero deltas → no-op", () => {
      const h = new HistoryImpl();
      h.atomic("test", () => {});
      expect(h.stack.canUndo).toBe(false);
    });
  });

  describe("Provider lifecycle", () => {
    it("dispose removes provider", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      const provider = new MockProvider("doc");
      const disposable = h.register(provider);

      h.atomic("edit", (tx) => {
        const d = counterDelta(c, 10, "doc");
        d.apply();
        tx.push(d);
      });

      disposable.dispose();
      await h.undo();
      // prepare should NOT have been called since provider was disposed
      expect(provider.prepareCalls).toBe(0);
    });

    it("reset() called on clear()", () => {
      const h = new HistoryImpl();
      const provider = new MockProvider("doc");
      h.register(provider);
      h.clear();
      expect(provider.resetCalls).toBe(1);
    });
  });

  describe("clearsFuture", () => {
    it("default: commit clears future", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      h.atomic("a", (tx) => {
        const d = counterDelta(c, 10);
        d.apply();
        tx.push(d);
      });
      await h.undo();
      expect(h.stack.canRedo).toBe(true);
      h.atomic("b", (tx) => {
        const d = counterDelta(c, 20);
        d.apply();
        tx.push(d);
      });
      expect(h.stack.canRedo).toBe(false);
    });

    it("clearsFuture:false preserves future", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      h.atomic("a", (tx) => {
        const d = counterDelta(c, 10);
        d.apply();
        tx.push(d);
      });
      await h.undo();
      expect(h.stack.canRedo).toBe(true);
      h.atomic(
        "select",
        (tx) => {
          tx.push({ providerId: "doc", apply: () => {}, revert: () => {} });
        },
        { clearsFuture: false }
      );
      expect(h.stack.canRedo).toBe(true);
    });
  });

  describe("prepare() failure", () => {
    it("cancels undo, stack unchanged", async () => {
      const h = new HistoryImpl();
      const c = { value: 0 };
      const provider = new MockProvider("doc");
      provider.prepareShouldFail = true;
      h.register(provider);

      h.atomic("edit", (tx) => {
        const d = counterDelta(c, 10, "doc");
        d.apply();
        tx.push(d);
      });

      const result = await h.undo();
      expect(result).toBe(false);
      expect(c.value).toBe(10); // unchanged — undo was cancelled
      expect(h.stack.canUndo).toBe(true); // tx still on stack
    });
  });
});
