import type { HistoryProvider, Disposable } from "../../src/types";

/**
 * A provider that tracks prepare/reset calls and can simulate async/failure.
 */
export class MockProvider implements HistoryProvider {
  readonly id: string;
  prepareCalls = 0;
  resetCalls = 0;
  disposeCalls = 0;

  /** Set > 0 to make prepare() async with this delay (ms). */
  prepareDelay = 0;

  /** Set true to make prepare() reject. */
  prepareShouldFail = false;

  constructor(id: string) {
    this.id = id;
  }

  prepare(): Disposable | Promise<Disposable> {
    this.prepareCalls++;

    if (this.prepareShouldFail) {
      if (this.prepareDelay > 0) {
        return new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`prepare failed: ${this.id}`)),
            this.prepareDelay
          )
        );
      }
      throw new Error(`prepare failed: ${this.id}`);
    }

    const disposable: Disposable = {
      dispose: () => {
        this.disposeCalls++;
      },
    };

    if (this.prepareDelay > 0) {
      return new Promise((resolve) =>
        setTimeout(() => resolve(disposable), this.prepareDelay)
      );
    }

    return disposable;
  }

  reset(): void {
    this.resetCalls++;
  }
}
