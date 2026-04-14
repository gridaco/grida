import {
  TransactionImpl,
  __resetTransactionIdCounter,
} from "../../src/transaction";
import type { CommittedTransaction } from "../../src/types";
import { counterDelta, failingRevertDelta } from "../helpers";

beforeEach(() => __resetTransactionIdCounter());

describe("Transaction", () => {
  describe("Invariant 1: sealed transaction rejects push", () => {
    it("push after commit throws", () => {
      const tx = new TransactionImpl("t", {}, null);
      const c = { value: 0 };
      tx.push(counterDelta(c, 1));
      tx.onCommit = () => {};
      tx.commit();
      expect(() => tx.push(counterDelta(c, 1))).toThrow();
    });

    it("push after abort throws", () => {
      const tx = new TransactionImpl("t", {}, null);
      const c = { value: 0 };
      tx.push(counterDelta(c, 1));
      tx.abort();
      expect(() => tx.push(counterDelta(c, 1))).toThrow();
    });

    it("commit after commit throws", () => {
      const tx = new TransactionImpl("t", {}, null);
      tx.onCommit = () => {};
      tx.commit(); // empty → no-op but still seals
      expect(() => tx.commit()).toThrow();
    });

    it("abort after abort throws", () => {
      const tx = new TransactionImpl("t", {}, null);
      tx.abort();
      expect(() => tx.abort()).toThrow();
    });
  });

  describe("Invariant 4: empty commit is no-op", () => {
    it("commit with no deltas does not call onCommit", () => {
      const tx = new TransactionImpl("t", {}, null);
      let called = false;
      tx.onCommit = () => {
        called = true;
      };
      tx.commit();
      expect(called).toBe(false);
      expect(tx.state).toBe("committed");
    });
  });

  describe("Invariant 5: abort reverts in reverse", () => {
    it("reverts C, B, A in that order", () => {
      const log: string[] = [];
      const tx = new TransactionImpl("t", {}, null);

      const makeDelta = (name: string) => ({
        providerId: "test",
        apply: () => log.push(`apply:${name}`),
        revert: () => log.push(`revert:${name}`),
      });

      tx.push(makeDelta("A"));
      tx.push(makeDelta("B"));
      tx.push(makeDelta("C"));
      tx.abort();

      expect(log).toEqual(["revert:C", "revert:B", "revert:A"]);
    });

    it("restores counter state", () => {
      const c = { value: 0 };
      const tx = new TransactionImpl("t", {}, null);
      tx.push(counterDelta(c, 10)); // 0 → 10
      c.value = 10;
      tx.push(counterDelta(c, 5)); // 10 → 15
      c.value = 15;
      tx.abort();
      expect(c.value).toBe(0);
    });
  });

  describe("Invariant 6: nesting", () => {
    it("inner commit merges deltas into outer", () => {
      const committed: CommittedTransaction[] = [];
      const outer = new TransactionImpl("outer", {}, null);
      outer.onCommit = (tx) => committed.push(tx);

      const inner = new TransactionImpl("inner", {}, outer);
      const c = { value: 0 };
      inner.push(counterDelta(c, 1));
      inner.commit();

      // Outer should now have the delta
      expect(outer.deltas.length).toBe(1);

      outer.push(counterDelta(c, 2));
      outer.commit();

      expect(committed.length).toBe(1);
      expect(committed[0].deltas.length).toBe(2);
    });

    it("inner abort reverts only inner, outer remains open", () => {
      const c = { value: 0 };
      const outer = new TransactionImpl("outer", {}, null);
      outer.onCommit = () => {};

      // Push to outer first
      const d1 = counterDelta(c, 10);
      d1.apply();
      outer.push(d1);

      const inner = new TransactionImpl("inner", {}, outer);
      const d2 = counterDelta(c, 5);
      d2.apply();
      inner.push(d2);

      inner.abort();
      // Inner's delta reverted, outer still open
      expect(c.value).toBe(10);
      expect(outer.state).toBe("open");
      expect(inner.state).toBe("aborted");
      // Outer should NOT have inner's delta
      expect(outer.deltas.length).toBe(1);
    });

    it("three levels deep: all commit → one flat list", () => {
      const committed: CommittedTransaction[] = [];
      const c = { value: 0 };

      const outer = new TransactionImpl("outer", {}, null);
      outer.onCommit = (tx) => committed.push(tx);

      const mid = new TransactionImpl("mid", {}, outer);
      mid.push(counterDelta(c, 1));

      const inner = new TransactionImpl("inner", {}, mid);
      inner.push(counterDelta(c, 2));
      inner.commit();

      mid.push(counterDelta(c, 3));
      mid.commit();

      outer.push(counterDelta(c, 4));
      outer.commit();

      expect(committed.length).toBe(1);
      expect(committed[0].deltas.length).toBe(4);
    });

    it("three levels: innermost abort → middle and outer unaffected", () => {
      const c = { value: 100 };
      const outer = new TransactionImpl("outer", {}, null);
      outer.onCommit = () => {};

      const mid = new TransactionImpl("mid", {}, outer);

      const inner = new TransactionImpl("inner", {}, mid);
      const d = counterDelta(c, -50);
      d.apply();
      inner.push(d);
      inner.abort();

      expect(c.value).toBe(100);
      expect(mid.state).toBe("open");
      expect(outer.state).toBe("open");
    });
  });

  describe("Invariant 13: abort with failing revert", () => {
    it("stops at first failure, seals as aborted", () => {
      const c = { value: 0 };
      const tx = new TransactionImpl("t", {}, null);

      // A (succeeds), B (fails revert), C (should be skipped)
      const dA = counterDelta(c, 10);
      dA.apply();
      tx.push(dA);

      c.value = 10;
      const dB = failingRevertDelta(c, 5);
      dB.apply();
      tx.push(dB);

      c.value = 15;
      const dC = counterDelta(c, 3);
      dC.apply();
      tx.push(dC);

      // C reverts (18→15), B fails, A is skipped
      tx.abort();
      expect(tx.state).toBe("aborted");
      // C was reverted (15), B's revert threw, A not reverted
      expect(c.value).toBe(15);
    });
  });
});
