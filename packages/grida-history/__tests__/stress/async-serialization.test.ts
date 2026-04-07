import { HistoryImpl } from "../../src/history";
import { MockProvider } from "../helpers/mock-provider";
import { counterDelta } from "../helpers";

describe("Stress: Async serialization", () => {
  it("5 simultaneous undo() calls execute sequentially", async () => {
    const h = new HistoryImpl();
    const c = { value: 0 };
    const log: string[] = [];
    const provider = new MockProvider("doc");
    provider.prepareDelay = 20;
    h.register(provider);

    // Push 5 items
    for (let i = 1; i <= 5; i++) {
      h.atomic(`step ${i}`, (tx) => {
        const d: any = counterDelta(c, 10, "doc");
        const origApply = d.apply;
        const origRevert = d.revert;
        d.apply = () => {
          log.push(`apply:${i}`);
          origApply();
        };
        d.revert = () => {
          log.push(`revert:${i}`);
          origRevert();
        };
        d.apply();
        tx.push(d);
      });
    }
    expect(c.value).toBe(50);
    log.length = 0; // clear setup logs

    // Fire all 5 undos simultaneously
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(h.undo());
    }

    const results = await Promise.all(promises);
    // All should succeed
    expect(results.every((r) => r === true)).toBe(true);
    expect(c.value).toBe(0);

    // Verify sequential execution: reverts should be 5, 4, 3, 2, 1
    expect(log).toEqual([
      "revert:5",
      "revert:4",
      "revert:3",
      "revert:2",
      "revert:1",
    ]);
  });

  it("busy flag is true during async operation", async () => {
    const h = new HistoryImpl();
    const c = { value: 0 };
    const provider = new MockProvider("doc");
    provider.prepareDelay = 50;
    h.register(provider);

    h.atomic("edit", (tx) => {
      const d = counterDelta(c, 10, "doc");
      d.apply();
      tx.push(d);
    });

    expect(h.busy).toBe(false);
    const promise = h.undo();
    expect(h.busy).toBe(true);
    await promise;
    expect(h.busy).toBe(false);
  });
});
