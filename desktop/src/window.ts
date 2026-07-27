import {
  BrowserWindow,
  screen,
  shell,
  type App,
  type BaseWindowConstructorOptions,
  type Rectangle,
} from "electron";
import path from "node:path";
import { attachNavigationEvents } from "./main/ipc-handlers";
import { RUNTIME_APP_ICON } from "./branding";
import { IS_DEV } from "./env";

/**
 * Title-bar row height in CSS pixels. Its controls center at 22px. The
 * workspace's right-side tab triggers occupy their own 44px row, so those
 * controls share the same `44 / 2 = 22px` axis. Must match
 * `.desktop-title-bar-height` in `editor/app/editor.css` — the renderer's
 * `<TitleBar>` reserves the same row so the OS-rendered
 * Min/Max/Close controls (Windows / Linux) sit flush with its chrome.
 */
const TITLE_BAR_HEIGHT = 44;

/**
 * The workspace shell's narrowest fully-operable layout:
 *
 *   320px chat + 360px document + 200px file tree + resize gutters.
 *
 * A cold-start Welcome window can client-navigate into that shell while
 * retaining the same BrowserWindow, so the native floor belongs to every main
 * window rather than only windows constructed directly on `/desktop/workspace`.
 */
const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 384;
const MAIN_WINDOW_WIDTH = 1440;
const MAIN_WINDOW_HEIGHT = 960;

const ONBOARDING_WINDOW_WIDTH = 720;
const ONBOARDING_WINDOW_HEIGHT = 720;
const MIN_ONBOARDING_WINDOW_WIDTH = 560;
const MIN_ONBOARDING_WINDOW_HEIGHT = 600;

export type DesktopWindowPresentation = "main" | "compact";

const trafficLightPosition = {
  x: 14,
  // macOS traffic lights are 12px tall. A 16px top position centers them at
  // `16 + 12 / 2 = 22px`, aligned with both title controls and document tabs.
  y: 16,
} as const;

/**
 * Validates `raw` is an `http:` or `https:` URL before handing it to
 * the OS default browser. Refuses `javascript:`, `file:`, `data:`,
 * and protocol-relative `//evil.com` strings — common phishing payloads.
 * Used by both the `setWindowOpenHandler` (renderer-initiated
 * `window.open`) and the `SHELL_OPEN_EXTERNAL` IPC handler.
 */
export function isSafeExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const WINDOW_ICON: { [key: string]: string | undefined } = {
  aix: undefined,
  android: undefined,
  darwin: undefined,
  freebsd: undefined,
  haiku: undefined,
  linux: RUNTIME_APP_ICON.png,
  openbsd: undefined,
  win32: RUNTIME_APP_ICON.ico,
  cygwin: undefined,
  netbsd: undefined,
};

function get_window_constructor_options(
  presentation: DesktopWindowPresentation
): BaseWindowConstructorOptions {
  const icon = WINDOW_ICON[process.platform];
  const size =
    presentation === "compact"
      ? {
          width: ONBOARDING_WINDOW_WIDTH,
          height: ONBOARDING_WINDOW_HEIGHT,
          minWidth: MIN_ONBOARDING_WINDOW_WIDTH,
          minHeight: MIN_ONBOARDING_WINDOW_HEIGHT,
          maximizable: false,
          fullscreenable: false,
        }
      : {
          width: MAIN_WINDOW_WIDTH,
          height: MAIN_WINDOW_HEIGHT,
          minWidth: MIN_WINDOW_WIDTH,
          minHeight: MIN_WINDOW_HEIGHT,
        };
  switch (process.platform) {
    case "darwin": {
      return {
        icon,
        titleBarStyle: "hidden",
        trafficLightPosition,
        ...size,
      };
    }
    case "linux":
      return {
        icon,
        titleBarStyle: "hidden",
        titleBarOverlay: {
          height: TITLE_BAR_HEIGHT - 1,
          // linux does not support transparent title bars
          color: "#ffff",
        },
        ...size,
      };
    case "win32": {
      return {
        icon,
        titleBarStyle: "hidden",
        titleBarOverlay: {
          height: TITLE_BAR_HEIGHT,
          color: "#00000000",
        },
        ...size,
      };
    }
    default: {
      return {
        icon,
        titleBarStyle: "default",
        ...size,
      };
    }
  }
}

/**
 * GRIDA-SEC-004 — second-layer navigation guard.
 *
 * Refuses any navigation off the configured `baseUrl` origin AND off the
 * `/desktop/*` path prefix. The preload's `window.grida` exposure is
 * decided at page-load time, so client-side nav to e.g. `/blog/foo`
 * would *leave* the bridge attached — unsafe. Block such navs.
 *
 * Whitelisted: same-origin `/desktop` and `/desktop/*` paths only —
 * enforced for user navigations (`will-navigate`), SPA navigations
 * (`did-navigate-in-page`), and server redirects (`will-redirect`,
 * GRIDA-SEC-005). OAuth handoff leaves the desktop window via
 * `shell.openExternal`.
 */
function register_window_hooks(
  window: BrowserWindow,
  { base_url: baseUrl }: { base_url: string }
) {
  window.webContents.on("will-prevent-unload", (event) => {
    // Allow the window to close even if the page tries to block it.
    event.preventDefault();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    // open all target="_blank" links in the user's default browser
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  window.webContents.on("will-navigate", (event, target) => {
    if (!isAllowedNavigation(baseUrl, target)) {
      event.preventDefault();
      // External? Hand off to OS browser.
      try {
        const parsed = new URL(target);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          shell.openExternal(target);
        }
      } catch {
        // Malformed URL — drop silently.
      }
    }
  });

  // GRIDA-SEC-005 — server 302s don't fire `will-navigate`, so without this
  // hook a redirect chain could walk the window off `/desktop/*` with the
  // bridge attached. Unlike `will-navigate`, a blocked redirect is NOT
  // handed to the OS browser: the target was chosen by a server response,
  // not by the user.
  //
  // Intentionally frame-agnostic (no `isMainFrame` filter): the desktop CSP
  // (GRIDA-SEC-004) already forbids cross-origin frames, so any redirect off
  // `/desktop/*` in ANY frame is unexpected and blocked. This is the stricter
  // choice — narrowing to the main frame would let a subframe redirect
  // off-surface.
  window.webContents.on("will-redirect", (event, target) => {
    if (!isAllowedNavigation(baseUrl, target)) {
      event.preventDefault();
      console.warn(
        `[grida] blocked redirect outside /desktop: ${urlWithoutQuery(target)}`
      );
    }
  });

  window.webContents.on("did-navigate-in-page", (_event, target) => {
    if (isAllowedNavigation(baseUrl, target)) return;
    console.warn(
      `[grida] blocked in-page navigation outside /desktop: ${urlWithoutQuery(target)}`
    );
    void window.loadURL(`${baseUrl}/desktop/welcome`);
  });
}

function urlWithoutQuery(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "<malformed>";
  }
}

export function isAllowedNavigation(baseUrl: string, target: string): boolean {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return false;
  }
  if (url.origin !== base.origin) return false;
  // Within our origin, only `/desktop/*` is reachable
  // from inside the desktop window. Everything else (marketing pages,
  // dashboard, public canvas) opens externally.
  return url.pathname === "/desktop" || url.pathname.startsWith("/desktop/");
}

export function create_desktop_window({
  app,
  base_url: baseUrl,
  urlPath = "/desktop/welcome",
  title = "Grida",
  additionalArguments = [],
  presentation = "main",
  show = true,
}: {
  app?: App;
  base_url: string;
  urlPath?: string | null;
  title?: string;
  additionalArguments?: string[];
  presentation?: DesktopWindowPresentation;
  show?: boolean;
}) {
  const desktopArguments = app
    ? buildDesktopArguments({ app, extra: additionalArguments })
    : additionalArguments;
  const window = new BrowserWindow({
    ...get_window_constructor_options(presentation),
    title,
    show,
    webPreferences: {
      // GRIDA-SEC-004 Electron hardening.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "preload.js"),
      additionalArguments: desktopArguments,
    },
  });

  if (presentation === "compact") window.center();

  if (IS_DEV) {
    // Dev-only diagnostics. Production logs must not depend on every
    // renderer console call staying secret-free.
    window.webContents.on("console-message", (event) => {
      const tag =
        event.level === "error"
          ? "[renderer:error]"
          : event.level === "warning"
            ? "[renderer:warn]"
            : "[renderer]";
      console.log(`${tag} ${event.message}`);
    });
  }

  // Register every navigation/security hook before the initial load.
  // A fast same-origin server redirect (notably Welcome → signed-out sign-in)
  // can complete before a listener attached after `loadURL`, skipping the
  // redirect guard entirely.
  register_window_hooks(window, { base_url: baseUrl });

  // Per-window nav-history push channel must observe the initial load too.
  attachNavigationEvents(window);

  if (urlPath !== null) void window.loadURL(`${baseUrl}${urlPath}`);

  return window;
}

export default create_desktop_window;

/**
 * Apply native geometry for an explicitly selected entry role.
 *
 * This function deliberately knows nothing about URLs. The entry-flow
 * controller owns the role; this low-level window module only applies its
 * presentation. Redirects and SPA history therefore cannot silently become
 * window-lifecycle state.
 */
export function set_desktop_window_presentation(
  window: BrowserWindow,
  presentation: DesktopWindowPresentation,
  options: {
    animate?: boolean;
    main_bounds?: Rectangle | null;
  } = {}
): void {
  if (window.isDestroyed()) return;

  const animate = options.animate ?? true;
  if (window.isFullScreen()) window.setFullScreen(false);
  if (presentation === "compact" && window.isMaximized()) window.unmaximize();

  if (presentation === "compact") {
    const workArea = screen.getDisplayMatching(window.getBounds()).workArea;
    const width = Math.min(ONBOARDING_WINDOW_WIDTH, workArea.width);
    const height = Math.min(ONBOARDING_WINDOW_HEIGHT, workArea.height);
    const x = workArea.x + Math.round((workArea.width - width) / 2);
    const y = workArea.y + Math.round((workArea.height - height) / 2);

    window.setMinimumSize(
      Math.min(MIN_ONBOARDING_WINDOW_WIDTH, width),
      Math.min(MIN_ONBOARDING_WINDOW_HEIGHT, height)
    );
    window.setResizable(true);
    window.setMaximizable(false);
    window.setFullScreenable(false);
    window.setBounds({ x, y, width, height }, animate);
    return;
  }

  const preferredBounds = options.main_bounds ?? window.getBounds();
  const workArea = screen.getDisplayMatching(preferredBounds).workArea;
  const fallbackWidth = Math.min(MAIN_WINDOW_WIDTH, workArea.width);
  const fallbackHeight = Math.min(MAIN_WINDOW_HEIGHT, workArea.height);
  const fallback = {
    x: workArea.x + Math.round((workArea.width - fallbackWidth) / 2),
    y: workArea.y + Math.round((workArea.height - fallbackHeight) / 2),
    width: fallbackWidth,
    height: fallbackHeight,
  };
  const bounds = options.main_bounds
    ? fitBoundsToWorkArea(options.main_bounds, workArea)
    : fallback;

  window.setMinimumSize(
    Math.min(MIN_WINDOW_WIDTH, bounds.width),
    Math.min(MIN_WINDOW_HEIGHT, bounds.height)
  );
  window.setResizable(true);
  window.setMaximizable(true);
  window.setFullScreenable(true);
  window.setBounds(bounds, animate);
}

function fitBoundsToWorkArea(
  bounds: Rectangle,
  workArea: Rectangle
): Rectangle {
  const width = Math.min(
    Math.max(bounds.width, MIN_WINDOW_WIDTH),
    workArea.width
  );
  const height = Math.min(
    Math.max(bounds.height, MIN_WINDOW_HEIGHT),
    workArea.height
  );
  const x = Math.min(
    Math.max(bounds.x, workArea.x),
    workArea.x + workArea.width - width
  );
  const y = Math.min(
    Math.max(bounds.y, workArea.y),
    workArea.y + workArea.height - height
  );
  return { x, y, width, height };
}

/**
 * GRIDA-SEC-004 — preload argv contract.
 *
 * Every window opened from the desktop process receives these flags.
 * Non-secret values are passed via `process.argv`. The agent server
 * password is fetched by preload over guarded IPC and is NEVER placed
 * on argv or `window.grida`:
 *
 *   --grida-version=<semver>           app.getVersion()
 *
 * Renderer-side, only the *result* of using these (a method on
 * `window.grida`) is observable — never the credentials themselves.
 */
function buildDesktopArguments({
  app,
  extra = [],
}: {
  app: App;
  extra?: string[];
}): string[] {
  return [`--grida-version=${app.getVersion()}`, ...extra];
}

/**
 * Opens an authenticated auxiliary Welcome window for File → New Window.
 * The canonical entry window is created and role-managed separately by
 * `DesktopEntryWindow`; this helper never participates in sign-in/onboarding
 * lifecycle decisions.
 */
export function open_welcome_window({
  app,
  base_url: baseUrl,
}: {
  app: App;
  base_url: string;
}) {
  return create_desktop_window({
    base_url: baseUrl,
    urlPath: "/desktop/welcome",
    additionalArguments: buildDesktopArguments({ app }),
  });
}

/**
 * Opens a per-document window for the supplied `docId`. Recipe 4
 * mechanics: each open document is its own BrowserWindow with its
 * own renderer process, addressed by `docId` (not by absolute path —
 * the agent server owns the path registry).
 *
 * Lands on the shared `/desktop/file` window in single-file (docId) mode; the
 * same route serves `.canvas` decks in bundle (`?id=`) mode (see
 * {@link open_canvas_window}).
 */
export function open_document_window({
  app,
  base_url: baseUrl,
  doc_id: docId,
}: {
  app: App;
  base_url: string;
  doc_id: string;
}) {
  return create_desktop_window({
    base_url: baseUrl,
    urlPath: `/desktop/file?docId=${encodeURIComponent(docId)}`,
    additionalArguments: buildDesktopArguments({ app }),
  });
}

/**
 * Opens the Preferences / Settings window. macOS convention is a
 * separate window for app-level preferences (Cmd+,); we follow that
 * on every platform so the BYOK key entry is discoverable without
 * losing the current doc window.
 *
 * Dedup is at the menu-click level (see `menu.ts`) — the caller
 * focuses an existing settings window if one is open, otherwise
 * invokes this function.
 */
export function open_settings_window({
  app,
  base_url: baseUrl,
}: {
  app: App;
  base_url: string;
}) {
  return create_desktop_window({
    base_url: baseUrl,
    urlPath: "/desktop/settings",
    title: "Grida Settings",
    additionalArguments: buildDesktopArguments({ app }),
  });
}

/**
 * Opens the workspace workbench for a given `workspaceId`. The renderer
 * resolves the id against `bridge.workspaces.list()` on mount; the
 * Electron side just spawns the URL with the query param. Dedup is
 * handled by the menu / caller — the convention is "focus an existing
 * workspace window for this id if one is open, else spawn."
 *
 * Window/tab UX is the host's concern (see
 * `docs/wg/desktop/process-model.md`). Today: one workspace = one
 * Electron BrowserWindow. The SDK doesn't care.
 */
export function open_workspace_window({
  app,
  base_url: baseUrl,
  workspace_id: workspaceId,
  session_id: sessionId,
}: {
  app: App;
  base_url: string;
  workspace_id: string;
  /**
   * Optional agent session to bring into view on first load (RFC `events`
   * §click-to-attend — a notification click whose workspace window was
   * closed). Carried on the URL (not IPC) because a fresh renderer has no
   * listener yet; the agent pane reads the param once on mount.
   */
  session_id?: string;
}) {
  const session = sessionId ? `&session=${encodeURIComponent(sessionId)}` : "";
  return create_desktop_window({
    base_url: baseUrl,
    urlPath: `/desktop/workspace?id=${encodeURIComponent(workspaceId)}${session}`,
    additionalArguments: buildDesktopArguments({ app }),
  });
}

/**
 * Opens the `.canvas` slides editor for a folder registered as `workspaceId`.
 * Same workspace substrate as {@link open_workspace_window} (the renderer reads
 * the bundle through the workspace bridge fs), but a deck surface instead of the
 * file workbench — the caller routes a folder here when it contains a
 * `.canvas.json`. Dedup is the caller's job (focus an existing
 * `/desktop/file?id=` window for this id, else spawn).
 *
 * Lands on the shared `/desktop/file` window in bundle (`?id=`) mode — the same
 * route serves single files in docId mode (see {@link open_document_window}).
 */
export function open_canvas_window({
  app,
  base_url: baseUrl,
  workspace_id: workspaceId,
}: {
  app: App;
  base_url: string;
  workspace_id: string;
}) {
  return create_desktop_window({
    base_url: baseUrl,
    urlPath: `/desktop/file?id=${encodeURIComponent(workspaceId)}`,
    additionalArguments: buildDesktopArguments({ app }),
  });
}
