/**
 * GRIDA-SEC-004 / GRIDA-SEC-005 — navigation allowlist predicate.
 *
 * `isAllowedNavigation` is the single predicate behind all three window
 * guards (`will-navigate`, `did-navigate-in-page`, and the GRIDA-SEC-005
 * `will-redirect` hook): same-origin AND `/desktop` or `/desktop/*` only.
 */
import { describe, it, expect, vi } from "vitest";

const { browserWindowInstances } = vi.hoisted(() => ({
  browserWindowInstances: [] as Array<{
    webContents: {
      handlers: Map<string, (...args: unknown[]) => void>;
      on: ReturnType<typeof vi.fn>;
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
    };
    loadURL: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("electron", () => ({
  BrowserWindow: class {
    webContents = {
      handlers: new Map<string, (...args: unknown[]) => void>(),
      on: vi.fn<(event: string, handler: (...args: unknown[]) => void) => void>(
        (event, handler) => {
          this.webContents.handlers.set(event, handler);
        }
      ),
      setWindowOpenHandler: vi.fn<(handler: unknown) => void>(),
    };
    loadURL = vi.fn<(url: string) => Promise<void>>(async () => undefined);
    once =
      vi.fn<(event: string, handler: (...args: unknown[]) => void) => void>();

    constructor() {
      browserWindowInstances.push(this);
    }
  },
  screen: {
    getDisplayMatching: vi.fn<
      (_bounds: unknown) => {
        workArea: { x: number; y: number; width: number; height: number };
      }
    >(() => ({
      workArea: { x: 0, y: 0, width: 1728, height: 1117 },
    })),
  },
  shell: { openExternal: vi.fn<(url: string) => Promise<void>>() },
}));
vi.mock("./main/ipc-handlers", () => ({
  attachNavigationEvents: vi.fn<() => void>(),
}));
vi.mock("./branding", () => ({
  RUNTIME_APP_ICON: { png: "icon.png", ico: "icon.ico" },
}));
vi.mock("./env", () => ({ IS_DEV: false }));

import {
  create_desktop_window,
  isAllowedNavigation,
  isSafeExternalUrl,
  set_desktop_window_presentation,
} from "./window";

const BASE = "https://grida.co";

describe("isAllowedNavigation", () => {
  it.each([
    ["/desktop", true],
    ["/desktop/", true],
    ["/desktop/onboarding", true],
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

describe("create_desktop_window navigation recovery", () => {
  it("delegates blocked entry-window in-page navigation to its role owner", () => {
    const recover = vi.fn<() => void>();
    const window = create_desktop_window({
      base_url: BASE,
      urlPath: null,
      on_disallowed_in_page_navigation: recover,
    });
    const instance = browserWindowInstances.at(-1);
    const handler = instance?.webContents.handlers.get("did-navigate-in-page");

    handler?.({}, `${BASE}/blog`);

    expect(recover).toHaveBeenCalledOnce();
    expect(window.loadURL).not.toHaveBeenCalled();
  });
});

describe("set_desktop_window_presentation", () => {
  it("applies entry-role and main geometry only when explicitly requested", () => {
    const window = {
      isDestroyed: vi.fn<() => boolean>(() => false),
      isFullScreen: vi.fn<() => boolean>(() => false),
      isMaximized: vi.fn<() => boolean>(() => false),
      setFullScreen: vi.fn<(value: boolean) => void>(),
      unmaximize: vi.fn<() => void>(),
      getBounds: vi.fn<
        () => { x: number; y: number; width: number; height: number }
      >(() => ({ x: 0, y: 0, width: 1440, height: 960 })),
      setMinimumSize: vi.fn<(width: number, height: number) => void>(),
      setResizable: vi.fn<(resizable: boolean) => void>(),
      setMaximizable: vi.fn<(maximizable: boolean) => void>(),
      setFullScreenable: vi.fn<(fullscreenable: boolean) => void>(),
      setBounds:
        vi.fn<
          (
            bounds: { x: number; y: number; width: number; height: number },
            animate?: boolean
          ) => void
        >(),
    };

    set_desktop_window_presentation(window as never, "compact");
    expect(window.setMinimumSize).toHaveBeenLastCalledWith(560, 600);
    expect(window.setMaximizable).toHaveBeenLastCalledWith(false);
    expect(window.setBounds).toHaveBeenLastCalledWith(
      { x: 504, y: 199, width: 720, height: 720 },
      true
    );

    set_desktop_window_presentation(window as never, "onboarding");
    expect(window.setMinimumSize).toHaveBeenLastCalledWith(560, 600);
    expect(window.setMaximizable).toHaveBeenLastCalledWith(false);
    expect(window.setBounds).toHaveBeenLastCalledWith(
      { x: 504, y: 109, width: 720, height: 900 },
      true
    );

    set_desktop_window_presentation(window as never, "main");
    expect(window.setMinimumSize).toHaveBeenLastCalledWith(900, 384);
    expect(window.setMaximizable).toHaveBeenLastCalledWith(true);
    expect(window.setBounds).toHaveBeenLastCalledWith(
      { x: 144, y: 79, width: 1440, height: 960 },
      true
    );
  });

  it("unmaximizes before compacting", () => {
    const window = {
      isDestroyed: () => false,
      isFullScreen: () => true,
      isMaximized: () => true,
      setFullScreen: vi.fn<(fullscreen: boolean) => void>(),
      unmaximize: vi.fn<() => void>(),
      getBounds: () => ({ x: 0, y: 0, width: 1440, height: 960 }),
      setMinimumSize: vi.fn<(width: number, height: number) => void>(),
      setResizable: vi.fn<(resizable: boolean) => void>(),
      setMaximizable: vi.fn<(maximizable: boolean) => void>(),
      setFullScreenable: vi.fn<(fullscreenable: boolean) => void>(),
      setBounds:
        vi.fn<
          (
            bounds: { x: number; y: number; width: number; height: number },
            animate?: boolean
          ) => void
        >(),
    };

    set_desktop_window_presentation(window as never, "compact");

    expect(window.setFullScreen).toHaveBeenCalledWith(false);
    expect(window.unmaximize).toHaveBeenCalled();
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
