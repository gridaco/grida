import { HistoryImpl } from "../../src/history";
import { counterDelta } from "../helpers";
import type { Delta, CommittedTransaction } from "../../src/types";

describe("Stress: Error recovery", () => {
  it("100 txs, middle one has broken revert → error fires, next undo works", async () => {
    const h = new HistoryImpl({ maxDepth: 200 });
    const c = { value: 0 };
    const errors: { tx: CommittedTransaction; error: unknown }[] = [];
    h.on("onError", (tx, error) => errors.push({ tx, error }));

    // Push 100 items, #50 has a broken revert
    for (let i = 0; i < 100; i++) {
      h.atomic(`step ${i}`, (tx) => {
        if (i === 49) {
          // Broken delta
          const brokenDelta: Delta = {
            providerId: "test",
            apply: () => {
              c.value += 1;
            },
            revert: () => {
              throw new Error("broken revert at 49");
            },
          };
          brokenDelta.apply();
          tx.push(brokenDelta);
        } else {
          const d = counterDelta(c, 1);
          d.apply();
          tx.push(d);
        }
      });
    }
    expect(c.value).toBe(100);

    // Undo 50 times (99, 98, ..., 50 — all succeed)
    for (let i = 0; i < 50; i++) {
      await h.undo();
    }
    expect(c.value).toBe(50);
    expect(errors.length).toBe(0);

    // Undo #49 — this one has the broken revert
    await h.undo();
    expect(errors.length).toBe(1);
    expect(errors[0].tx.label).toBe("step 49");

    // Stack should have removed the broken tx
    // We should be able to continue undoing
    // After the broken revert, c.value is 50 (step 49's revert failed, no change)
    // Next undo is step 48 (since 49 was removed from stack)
    const result = await h.undo();
    expect(result).toBe(true);
    // step 48 undone: 50 - 1 = 49... but wait, the broken tx revert partially ran.
    // Actually: steps 50..99 were undone (value went from 100 to 50).
    // Then step 49 revert fails (value stays at 50, tx removed).
    // Then step 48 undo: reverts delta that went from 48 to 49, so value = 48.
    expect(c.value).toBe(48);
  });
});
