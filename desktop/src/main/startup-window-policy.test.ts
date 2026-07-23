import { describe, expect, it } from "vitest";
import { startup_window } from "./startup-window-policy";

describe("startup_window", () => {
  it.each([
    [{ pending_files: 0, pending_deep_links: 0 }, "restore-last-workspace"],
    [{ pending_files: 1, pending_deep_links: 0 }, "welcome"],
    [{ pending_files: 0, pending_deep_links: 1 }, "welcome"],
    [{ pending_files: 1, pending_deep_links: 1 }, "welcome"],
  ] as const)("selects the bootstrap for %o", (input, expected) => {
    expect(startup_window.bootstrap(input)).toBe(expected);
  });

  it.each([
    [false, true, false],
    [true, false, false],
    [true, true, true],
  ] as const)(
    "dispatches a launch intent only after app=%s bootstrap=%s",
    (appReady, bootstrapComplete, expected) => {
      expect(
        startup_window.canDispatchLaunchIntent({
          app_ready: appReady,
          bootstrap_complete: bootstrapComplete,
        })
      ).toBe(expected);
    }
  );
});
