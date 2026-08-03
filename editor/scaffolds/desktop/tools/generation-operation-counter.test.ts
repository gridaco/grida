import { describe, expect, it } from "vitest";
import { GenerationOperationCounter } from "./generation-operation-counter";

describe("GenerationOperationCounter", () => {
  it("counts concurrent operations without underflowing", () => {
    let state = GenerationOperationCounter.initial("images");
    const update = (busy: boolean) => {
      state = GenerationOperationCounter.update(state, {
        sourceEpoch: "images",
        activeEpoch: "images",
        busy,
      });
    };

    update(true);
    update(true);
    update(false);
    expect(GenerationOperationCounter.isBusy(state, "images")).toBe(true);
    update(false);
    update(false);
    expect(state).toEqual({ epoch: "images", count: 0 });
  });

  it("stops projecting old operations as busy when the epoch changes", () => {
    const state = GenerationOperationCounter.update(
      GenerationOperationCounter.initial("images"),
      { sourceEpoch: "images", activeEpoch: "images", busy: true }
    );

    expect(GenerationOperationCounter.isBusy(state, "video")).toBe(false);
  });

  it("starts a new epoch at zero and ignores stale completion signals", () => {
    const oldState = GenerationOperationCounter.update(
      GenerationOperationCounter.initial("images"),
      { sourceEpoch: "images", activeEpoch: "images", busy: true }
    );
    const currentState = GenerationOperationCounter.update(oldState, {
      sourceEpoch: "video",
      activeEpoch: "video",
      busy: true,
    });
    const afterStaleCompletion = GenerationOperationCounter.update(
      currentState,
      { sourceEpoch: "images", activeEpoch: "video", busy: false }
    );

    expect(currentState).toEqual({ epoch: "video", count: 1 });
    expect(afterStaleCompletion).toBe(currentState);
    expect(
      GenerationOperationCounter.isBusy(afterStaleCompletion, "video")
    ).toBe(true);
  });

  it("ignores every signal emitted by an inactive epoch", () => {
    const state = GenerationOperationCounter.initial("video");
    const afterStaleStart = GenerationOperationCounter.update(state, {
      sourceEpoch: "images",
      activeEpoch: "video",
      busy: true,
    });

    expect(afterStaleStart).toBe(state);
  });
});
