import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkingIndicator } from "./working-indicator";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("WorkingIndicator", () => {
  it("shows immediately before first output, then delays only later quiet gaps", () => {
    const indicator = new WorkingIndicator();
    const stopInitial = indicator.watch(0, true);
    expect(indicator.read()).toEqual({ progress: 0, visible: true });
    expect(vi.getTimerCount()).toBe(0);

    stopInitial();
    const stopStream = indicator.watch(1);
    expect(indicator.read()).toEqual({ progress: 1, visible: false });
    vi.advanceTimersByTime(WorkingIndicator.delayMs - 1);
    expect(indicator.read().visible).toBe(false);
    vi.advanceTimersByTime(1);
    expect(indicator.read().visible).toBe(true);
    stopStream();
  });

  it("waits for a quiet period and hides immediately when progress resumes", () => {
    const indicator = new WorkingIndicator();
    const stop = indicator.watch(1);
    vi.advanceTimersByTime(WorkingIndicator.delayMs - 1);
    expect(indicator.read().visible).toBe(false);
    vi.advanceTimersByTime(1);
    expect(indicator.read()).toEqual({ progress: 1, visible: true });

    const stopNext = indicator.watch(2);
    expect(indicator.read()).toEqual({ progress: 2, visible: false });
    // Cleanup from the previous render must not cancel the next quiet period.
    stop();
    vi.advanceTimersByTime(WorkingIndicator.delayMs);
    expect(indicator.read()).toEqual({ progress: 2, visible: true });
    stopNext();
  });

  it("never flashes during continuous streaming and shows after the final update", () => {
    const indicator = new WorkingIndicator();
    let stop = () => {};
    for (let progress = 1; progress <= 8; progress++) {
      stop = indicator.watch(progress);
      vi.advanceTimersByTime(200);
      expect(indicator.read().visible).toBe(false);
    }
    vi.advanceTimersByTime(WorkingIndicator.delayMs - 201);
    expect(indicator.read().visible).toBe(false);
    vi.advanceTimersByTime(1);
    expect(indicator.read()).toEqual({ progress: 8, visible: true });
    stop();
  });

  it("cancels pending and visible indicators when a turn finishes or its view closes", () => {
    const indicator = new WorkingIndicator();
    const changed = vi.fn<() => void>();
    const unsubscribe = indicator.subscribe(changed);
    const stop = indicator.watch(1);
    vi.advanceTimersByTime(500);
    stop();
    vi.advanceTimersByTime(WorkingIndicator.delayMs);
    expect(indicator.read().visible).toBe(false);

    const stopNext = indicator.watch(2);
    vi.advanceTimersByTime(WorkingIndicator.delayMs);
    expect(indicator.read().visible).toBe(true);
    stopNext();
    expect(indicator.read().visible).toBe(false);
    const calls = changed.mock.calls.length;
    unsubscribe();
    vi.advanceTimersByTime(WorkingIndicator.delayMs * 2);
    expect(changed).toHaveBeenCalledTimes(calls);
  });
});
