/**
 * GRIDA-SEC-004 / GRIDA-SEC-005 — navigation allowlist predicate.
 *
 * `isAllowedNavigation` is the single predicate behind all three window
 * guards (`will-navigate`, `did-navigate-in-page`, and the GRIDA-SEC-005
 * `will-redirect` hook): same-origin AND `/desktop` or `/desktop/*` only.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: class {},
  shell: { openExternal: vi.fn<(url: string) => Promise<void>>() },
}));
vi.mock("./main/ipc-handlers", () => ({
  attachNavigationEvents: vi.fn<() => void>(),
}));
vi.mock("./branding", () => ({
  RUNTIME_APP_ICON: { png: "icon.png", ico: "icon.ico" },
}));
vi.mock("./env", () => ({ IS_DEV: false }));

import { isAllowedNavigation, isSafeExternalUrl } from "./window";

const BASE = "https://grida.co";

describe("isAllowedNavigation", () => {
  it.each([
    ["/desktop", true],
    ["/desktop/", true],
    ["/desktop/welcome", true],
    ["/desktop/auth/sign-in?auth_error=x", true],
    ["/desktop/auth/callback?code=abc", true],
    ["/desktopX", false], // prefix must be a path segment
    ["/", false],
    ["/sign-out", false], // would sign the user out of the OS browser
    ["/auth/callback?code=abc", false], // web callback — not the desktop one
    ["/blog/foo", false],
  ])("%s → %s", (path, allowed) => {
    expect(isAllowedNavigation(BASE, `${BASE}${path}`)).toBe(allowed);
  });

  it("rejects cross-origin /desktop paths", () => {
    expect(isAllowedNavigation(BASE, "https://evil.com/desktop/welcome")).toBe(
      false
    );
  });

  it("rejects malformed targets and base URLs", () => {
    expect(isAllowedNavigation(BASE, "not a url")).toBe(false);
    expect(isAllowedNavigation("not a url", `${BASE}/desktop`)).toBe(false);
  });
});

describe("isSafeExternalUrl", () => {
  it.each([
    ["https://accounts.google.com/o/oauth2/auth", true],
    ["http://localhost:3000/x", true],
    ["javascript:alert(1)", false],
    ["file:///etc/passwd", false],
    ["grida://auth/callback", false],
    ["//evil.com", false],
  ])("%s → %s", (url, safe) => {
    expect(isSafeExternalUrl(url)).toBe(safe);
  });
});
