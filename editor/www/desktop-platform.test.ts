import { describe, expect, it } from "vitest";
import { desktopPlatform } from "./desktop-platform";

describe("desktopPlatform.detect", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "mac"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "linux"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile", null],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", null],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", null],
    ["", null],
  ])("detects the desktop OS in %s", (userAgent, expected) => {
    expect(desktopPlatform.detect(userAgent)).toBe(expected);
  });

  it("keeps iPadOS in desktop browsing mode on the mobile fallback", () => {
    expect(
      desktopPlatform.detect(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        5
      )
    ).toBeNull();
  });
});
