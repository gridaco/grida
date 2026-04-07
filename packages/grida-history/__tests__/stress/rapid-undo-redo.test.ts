import { HistoryImpl } from "../../src/history";
import { counterDelta } from "../helpers";

describe("Stress: Rapid undo/redo", () => {
  it("push 100 → undo all → redo all → state matches", async () => {
    const h = new HistoryImpl({ maxDepth: 200 });
    const c = { value: 0 };

    for (let i = 0; i < 100; i++) {
      h.atomic(`step ${i}`, (tx) => {
        const d = counterDelta(c, 1);
        d.apply();
        tx.push(d);
      });
    }
    expect(c.value).toBe(100);

    // Undo all
    for (let i = 0; i < 100; i++) {
      await h.undo();
    }
    expect(c.value).toBe(0);

    // Redo all
    for (let i = 0; i < 100; i++) {
      await h.redo();
    }
    expect(c.value).toBe(100);
  });

  it("push 100 → undo 50 → push 1 → redo returns false", async () => {
    const h = new HistoryImpl({ maxDepth: 200 });
    const c = { value: 0 };

    for (let i = 0; i < 100; i++) {
      h.atomic(`step ${i}`, (tx) => {
        const d = counterDelta(c, 1);
        d.apply();
        tx.push(d);
      });
    }

    for (let i = 0; i < 50; i++) {
      await h.undo();
    }
    expect(c.value).toBe(50);
    expect(h.stack.canRedo).toBe(true);

    // New commit clears future
    h.atomic("new", (tx) => {
      const d = counterDelta(c, 100);
      d.apply();
      tx.push(d);
    });

    expect(h.stack.canRedo).toBe(false);
    const result = await h.redo();
    expect(result).toBe(false);
  });
});
