import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { onboarding_flag } from "./onboarding-flag";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const values = new Map<string, string>();
const getItem = vi.fn<(key: string) => string | null>(
  (key) => values.get(key) ?? null
);
const setItem = vi.fn<(key: string, value: string) => void>((key, value) => {
  values.set(key, value);
});

describe("onboarding_flag", () => {
  beforeEach(() => {
    values.clear();
    getItem.mockReset().mockImplementation((key) => values.get(key) ?? null);
    setItem.mockReset().mockImplementation((key, value) => {
      values.set(key, value);
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: { getItem, setItem } },
    });
  });

  afterAll(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("is incomplete until onboarding is marked complete", () => {
    expect(onboarding_flag.isComplete()).toBe(false);

    onboarding_flag.markComplete();

    expect(onboarding_flag.isComplete()).toBe(true);
  });

  it("fails open when completion cannot be read", () => {
    getItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(onboarding_flag.isComplete()).toBe(false);
  });

  it("does not throw when completion cannot be persisted", () => {
    setItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => onboarding_flag.markComplete()).not.toThrow();
  });
});
