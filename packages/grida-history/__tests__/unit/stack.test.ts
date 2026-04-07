import { StackImpl } from "../../src/stack";
import type { CommittedTransaction } from "../../src/types";

function makeTx(label: string): CommittedTransaction {
  return {
    id: `tx_${label}`,
    label,
    deltas: [],
    origin: { type: "local" },
    opts: {},
  };
}

describe("Stack", () => {
  describe("basics", () => {
    it("push then popUndo returns same transaction", () => {
      const s = new StackImpl();
      const tx = makeTx("a");
      s.push(tx, true);
      expect(s.popUndo()).toBe(tx);
    });

    it("popUndo moves to future", () => {
      const s = new StackImpl();
      s.push(makeTx("a"), true);
      s.popUndo();
      expect(s.canRedo).toBe(true);
      expect(s.canUndo).toBe(false);
    });

    it("popRedo moves to past", () => {
      const s = new StackImpl();
      s.push(makeTx("a"), true);
      s.popUndo();
      s.popRedo();
      expect(s.canUndo).toBe(true);
      expect(s.canRedo).toBe(false);
    });

    it("popUndo on empty returns null", () => {
      const s = new StackImpl();
      expect(s.popUndo()).toBeNull();
    });

    it("popRedo on empty returns null", () => {
      const s = new StackImpl();
      expect(s.popRedo()).toBeNull();
    });

    it("push clears future by default", () => {
      const s = new StackImpl();
      s.push(makeTx("a"), true);
      s.popUndo(); // a -> future
      expect(s.canRedo).toBe(true);
      s.push(makeTx("b"), true);
      expect(s.canRedo).toBe(false);
    });

    it("push with clearsFuture=false preserves future", () => {
      const s = new StackImpl();
      s.push(makeTx("a"), true);
      s.popUndo();
      s.push(makeTx("b"), false);
      expect(s.canRedo).toBe(true);
    });

    it("clear empties both", () => {
      const s = new StackImpl();
      s.push(makeTx("a"), true);
      s.push(makeTx("b"), true);
      s.popUndo();
      s.clear();
      expect(s.canUndo).toBe(false);
      expect(s.canRedo).toBe(false);
    });

    it("canUndo/canRedo reflect state", () => {
      const s = new StackImpl();
      expect(s.canUndo).toBe(false);
      expect(s.canRedo).toBe(false);
      s.push(makeTx("a"), true);
      expect(s.canUndo).toBe(true);
      expect(s.canRedo).toBe(false);
    });

    it("undoLabel/redoLabel reflect top of respective stack", () => {
      const s = new StackImpl();
      expect(s.undoLabel).toBeNull();
      expect(s.redoLabel).toBeNull();
      s.push(makeTx("first"), true);
      s.push(makeTx("second"), true);
      expect(s.undoLabel).toBe("second");
      s.popUndo();
      expect(s.undoLabel).toBe("first");
      expect(s.redoLabel).toBe("second");
    });

    it("pastCount/futureCount track sizes", () => {
      const s = new StackImpl();
      expect(s.pastCount).toBe(0);
      expect(s.futureCount).toBe(0);
      s.push(makeTx("a"), true);
      s.push(makeTx("b"), true);
      expect(s.pastCount).toBe(2);
      s.popUndo();
      expect(s.pastCount).toBe(1);
      expect(s.futureCount).toBe(1);
    });
  });

  describe("Invariant 8: max depth eviction", () => {
    it("evicts oldest when over capacity", () => {
      const s = new StackImpl({ maxDepth: 3 });
      s.push(makeTx("a"), true);
      s.push(makeTx("b"), true);
      s.push(makeTx("c"), true);
      s.push(makeTx("d"), true);
      expect(s.pastCount).toBe(3);
      // oldest (a) should be evicted
      const first = s.popUndo();
      expect(first!.label).toBe("d");
      const second = s.popUndo();
      expect(second!.label).toBe("c");
      const third = s.popUndo();
      expect(third!.label).toBe("b");
      expect(s.popUndo()).toBeNull(); // a was evicted
    });

    it("future is never evicted", () => {
      const s = new StackImpl({ maxDepth: 3 });
      s.push(makeTx("a"), true);
      s.push(makeTx("b"), true);
      s.push(makeTx("c"), true);
      // undo all to future
      s.popUndo();
      s.popUndo();
      s.popUndo();
      expect(s.futureCount).toBe(3);
      // push more to past — future should stay
      s.push(makeTx("d"), false);
      s.push(makeTx("e"), false);
      s.push(makeTx("f"), false);
      s.push(makeTx("g"), false);
      expect(s.futureCount).toBe(3);
    });

    it("eviction preserves order", () => {
      const s = new StackImpl({ maxDepth: 2 });
      s.push(makeTx("a"), true);
      s.push(makeTx("b"), true);
      s.push(makeTx("c"), true);
      // should have b, c
      expect(s.popUndo()!.label).toBe("c");
      expect(s.popUndo()!.label).toBe("b");
      expect(s.popUndo()).toBeNull();
    });
  });

  describe("remove", () => {
    it("removes from past", () => {
      const s = new StackImpl();
      const tx = makeTx("a");
      s.push(tx, true);
      s.remove(tx);
      expect(s.canUndo).toBe(false);
    });

    it("removes from future", () => {
      const s = new StackImpl();
      const tx = makeTx("a");
      s.push(tx, true);
      s.popUndo();
      s.remove(tx);
      expect(s.canRedo).toBe(false);
    });
  });

  describe("undoPopUndo / undoPopRedo", () => {
    it("undoPopUndo moves tx from future back to past", () => {
      const s = new StackImpl();
      const tx = makeTx("a");
      s.push(tx, true);
      s.popUndo(); // now in future
      s.undoPopUndo(tx); // back to past
      expect(s.canUndo).toBe(true);
      expect(s.canRedo).toBe(false);
    });

    it("undoPopRedo moves tx from past back to future", () => {
      const s = new StackImpl();
      const tx = makeTx("a");
      s.push(tx, true);
      s.popUndo(); // in future
      s.popRedo(); // back in past
      s.undoPopRedo(tx); // back to future
      expect(s.canUndo).toBe(false);
      expect(s.canRedo).toBe(true);
    });
  });
});
