import { describe, expect, it } from "vitest";
import { startup_window } from "./startup-window-policy";

describe("startup_window", () => {
  it.each([
    [{ pending_files: 0 }, "restore-last-workspace"],
    [{ pending_files: 1 }, "welcome"],
  ] as const)(
    "selects the authenticated bootstrap for %o",
    (input, expected) => {
      expect(startup_window.bootstrap(input)).toBe(expected);
    }
  );

  it.each([
    [false, true, false],
    [true, false, false],
    [true, true, true],
  ] as const)(
    "dispatches work only after app=%s entry-main=%s",
    (appReady, entryMain, expected) => {
      expect(
        startup_window.canDispatchLaunchIntent({
          app_ready: appReady,
          entry_main: entryMain,
        })
      ).toBe(expected);
    }
  );
});
