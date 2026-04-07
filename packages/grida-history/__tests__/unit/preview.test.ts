import { PreviewImpl, __resetPreviewIdCounter } from "../../src/preview";
import type { Delta } from "../../src/types";

beforeEach(() => __resetPreviewIdCounter());

function makeCounterDelta(counter: { value: number }, to: number): Delta {
  const from = counter.value;
  return {
    providerId: "test",
    apply: () => {
      counter.value = to;
    },
    revert: () => {
      counter.value = from;
    },
  };
}

describe("Preview", () => {
  describe("basics", () => {
    it("set applies delta", () => {
      const c = { value: 0 };
      const p = new PreviewImpl("test");
      p.set(makeCounterDelta(c, 5));
      expect(c.value).toBe(5);
    });

    it("set reverts previous before applying new", () => {
      const c = { value: 0 };
      const p = new PreviewImpl("test");
      p.set(makeCounterDelta(c, 5));
      expect(c.value).toBe(5);
      p.set(makeCounterDelta(c, 10)); // reverts 5→0, then applies 0→10
      expect(c.value).toBe(10);
    });

    it("commit seals", () => {
      const c = { value: 0 };
      const p = new PreviewImpl("test");
      p.onCommit = () => {};
      p.set(makeCounterDelta(c, 5));
      p.commit();
      expect(p.state).toBe("committed");
      expect(c.value).toBe(5); // stays applied
    });

    it("discard reverts and seals", () => {
      const c = { value: 0 };
      const p = new PreviewImpl("test");
      p.set(makeCounterDelta(c, 5));
      p.discard();
      expect(p.state).toBe("discarded");
      expect(c.value).toBe(0);
    });

    it("set after commit throws", () => {
      const c = { value: 0 };
      const p = new PreviewImpl("test");
      p.onCommit = () => {};
      p.commit();
      expect(() => p.set(makeCounterDelta(c, 5))).toThrow();
    });

    it("set after discard throws", () => {
      const c = { value: 0 };
      const p = new PreviewImpl("test");
      p.discard();
      expect(() => p.set(makeCounterDelta(c, 5))).toThrow();
    });

    it("commit with no active delta is sealed (no-op)", () => {
      const p = new PreviewImpl("test");
      let committed = false;
      p.onCommit = () => {
        committed = true;
      };
      p.commit();
      expect(p.state).toBe("committed");
      expect(committed).toBe(false); // no delta → onCommit not called
    });

    it("discard with no active delta is sealed (no-op)", () => {
      const p = new PreviewImpl("test");
      p.discard();
      expect(p.state).toBe("discarded");
    });
  });

  describe("state tracking with counter", () => {
    it("set, set, discard → back to original", () => {
      const c = { value: 0 };
      const p = new PreviewImpl("test");

      // First set: from=0, to=1
      p.set(makeCounterDelta(c, 1));
      expect(c.value).toBe(1);

      // Second set: reverts previous (1→0), then captures from=0, to=2
      // We must create the delta with the value that will exist AFTER revert
      // This matches the real-world pattern where the preview always
      // reverts to original before applying the new candidate.
      const d2: Delta = {
        providerId: "test",
        apply: () => {
          c.value = 2;
        },
        revert: () => {
          c.value = 0;
        }, // reverts to original, not previous preview
      };
      p.set(d2);
      expect(c.value).toBe(2);

      p.discard();
      expect(c.value).toBe(0);
    });

    it("set, commit → state persisted", () => {
      const c = { value: 0 };
      const p = new PreviewImpl("test");
      let result: any = null;
      p.onCommit = (tx) => {
        result = tx;
      };
      p.set(makeCounterDelta(c, 1));
      p.commit();
      expect(c.value).toBe(1);
      expect(result).not.toBeNull();
      expect(result.deltas.length).toBe(1);
    });
  });
});
