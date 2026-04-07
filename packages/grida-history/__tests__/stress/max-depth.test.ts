import { HistoryImpl } from "../../src/history";
import { counterDelta } from "../helpers";

describe("Stress: Max depth", () => {
  it("push 1000 with maxDepth 50 → pastCount === 50", () => {
    const h = new HistoryImpl({ maxDepth: 50 });
    const c = { value: 0 };

    for (let i = 0; i < 1000; i++) {
      h.atomic(`step ${i}`, (tx) => {
        const d = counterDelta(c, 1);
        d.apply();
        tx.push(d);
      });
    }

    expect(c.value).toBe(1000);
    expect(h.stack.pastCount).toBe(50);
  });

  it("undo 50 times succeeds, 51st returns false", async () => {
    const h = new HistoryImpl({ maxDepth: 50 });
    const c = { value: 0 };

    for (let i = 0; i < 100; i++) {
      h.atomic(`step ${i}`, (tx) => {
        const d = counterDelta(c, 1);
        d.apply();
        tx.push(d);
      });
    }

    for (let i = 0; i < 50; i++) {
      const result = await h.undo();
      expect(result).toBe(true);
    }

    const result = await h.undo();
    expect(result).toBe(false);
    expect(c.value).toBe(50); // 100 - 50 undone
  });
});
