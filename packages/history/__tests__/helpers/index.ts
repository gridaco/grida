export { MockStore } from "./mock-store";
export { MockProvider } from "./mock-provider";

import type { Delta } from "../../src/types";

/** Create a simple counter-based delta for tests. */
export function counterDelta(
  counter: { value: number },
  increment: number,
  providerId = "test"
): Delta {
  const before = counter.value;
  const after = counter.value + increment;
  return {
    providerId,
    apply: () => {
      counter.value = after;
    },
    revert: () => {
      counter.value = before;
    },
  };
}

/** Create a delta whose revert() throws. */
export function failingRevertDelta(
  counter: { value: number },
  increment: number,
  providerId = "test"
): Delta {
  const before = counter.value;
  const after = counter.value + increment;
  return {
    providerId,
    apply: () => {
      counter.value = after;
    },
    revert: () => {
      throw new Error("revert failed");
    },
  };
}

/** Create a delta whose apply() throws. */
export function failingApplyDelta(providerId = "test"): Delta {
  return {
    providerId,
    apply: () => {
      throw new Error("apply failed");
    },
    revert: () => {},
  };
}
