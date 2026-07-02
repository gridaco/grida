/**
 * GRIDA-SEC-005 — deep-link auth callback routing.
 *
 * Pins the router's contract: every branch consumes (returns `true` — a
 * `false` re-queues the URL forever in main.ts's drain loop), only the fixed
 * same-origin `/desktop/auth/callback` path is ever navigated to, and only
 * the known `code`/`error*` params cross the boundary.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { all: MockWindow[]; focused: MockWindow | null } = {
  all: [],
  focused: null,
};

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => state.all,
    getFocusedWindow: () => state.focused,
  },
}));
vi.mock("../env", () => ({ EDITOR_BASE_URL: "https://grida.test" }));

import { routeDeepLink } from "./protocol-router";

type MockWindow = ReturnType<typeof makeWindow>;

function makeWindow(url: string, { minimized = false } = {}) {
  return {
    isDestroyed: () => false,
    isMinimized: () => minimized,
    restore: vi.fn<() => void>(),
    focus: vi.fn<() => void>(),
    loadURL: vi.fn<(url: string) => Promise<void>>(),
    webContents: { getURL: () => url },
  };
}

beforeEach(() => {
  state.all = [];
  state.focused = null;
});

describe("routeDeepLink — non-auth links", () => {
  it("consumes malformed URLs", async () => {
    await expect(routeDeepLink("not a url")).resolves.toBe(true);
  });

  it("consumes non-grida protocols", async () => {
    await expect(routeDeepLink("https://example.com/x")).resolves.toBe(true);
  });

  it("consumes unknown hosts without navigating", async () => {
    const window = makeWindow("https://grida.test/desktop/welcome");
    state.all = [window];
    await expect(routeDeepLink("grida://open/foo")).resolves.toBe(true);
    expect(window.loadURL).not.toHaveBeenCalled();
  });

  it("consumes unknown auth paths without navigating", async () => {
    const window = makeWindow("https://grida.test/desktop/welcome");
    state.all = [window];
    await expect(routeDeepLink("grida://auth/other?code=x")).resolves.toBe(
      true
    );
    expect(window.loadURL).not.toHaveBeenCalled();
  });
});

describe("routeDeepLink — auth/callback", () => {
  it("navigates to the fixed same-origin callback route with the code", async () => {
    const window = makeWindow("https://grida.test/desktop/auth/sign-in");
    state.all = [window];
    await expect(
      routeDeepLink("grida://auth/callback?code=abc-123")
    ).resolves.toBe(true);
    expect(window.loadURL).toHaveBeenCalledWith(
      "https://grida.test/desktop/auth/callback?code=abc-123"
    );
    expect(window.focus).toHaveBeenCalled();
  });

  it("matches a case-varied auth host (custom schemes aren't lowercased)", async () => {
    const window = makeWindow("https://grida.test/desktop/auth/sign-in");
    state.all = [window];
    await routeDeepLink("grida://Auth/callback?code=abc-123");
    expect(window.loadURL).toHaveBeenCalledWith(
      "https://grida.test/desktop/auth/callback?code=abc-123"
    );
  });

  it("forwards only known params — attacker extras are dropped", async () => {
    const window = makeWindow("https://grida.test/desktop/auth/sign-in");
    state.all = [window];
    await routeDeepLink(
      "grida://auth/callback?code=abc&evil=payload&error_code=otp_expired"
    );
    const target = new URL(window.loadURL.mock.calls[0][0]);
    expect(target.origin).toBe("https://grida.test");
    expect(target.pathname).toBe("/desktop/auth/callback");
    expect(target.searchParams.get("code")).toBe("abc");
    expect(target.searchParams.get("error_code")).toBe("otp_expired");
    expect(target.searchParams.has("evil")).toBe(false);
  });

  it("forwards GoTrue error params when no code is present", async () => {
    const window = makeWindow("https://grida.test/desktop/auth/sign-in");
    state.all = [window];
    await routeDeepLink("grida://auth/callback?error=access_denied");
    const target = new URL(window.loadURL.mock.calls[0][0]);
    expect(target.pathname).toBe("/desktop/auth/callback");
    expect(target.searchParams.get("error")).toBe("access_denied");
  });

  it("prefers the window waiting on the sign-in page over the focused one", async () => {
    const other = makeWindow("https://grida.test/desktop/settings");
    const signin = makeWindow("https://grida.test/desktop/auth/sign-in");
    state.all = [other, signin];
    state.focused = other;
    await routeDeepLink("grida://auth/callback?code=abc");
    expect(signin.loadURL).toHaveBeenCalled();
    expect(other.loadURL).not.toHaveBeenCalled();
  });

  it("falls back to the focused window, then any window", async () => {
    const a = makeWindow("https://grida.test/desktop/welcome");
    const b = makeWindow("https://grida.test/desktop/settings");
    state.all = [a, b];
    state.focused = b;
    await routeDeepLink("grida://auth/callback?code=abc");
    expect(b.loadURL).toHaveBeenCalled();

    state.focused = null;
    await routeDeepLink("grida://auth/callback?code=def");
    expect(a.loadURL).toHaveBeenCalled();
  });

  it("restores a minimized window before navigating", async () => {
    const window = makeWindow("https://grida.test/desktop/auth/sign-in", {
      minimized: true,
    });
    state.all = [window];
    await routeDeepLink("grida://auth/callback?code=abc");
    expect(window.restore).toHaveBeenCalled();
  });

  it("consumes safely when no window exists (cold macOS state)", async () => {
    await expect(routeDeepLink("grida://auth/callback?code=abc")).resolves.toBe(
      true
    );
  });
});
