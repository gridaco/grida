import {
  BrowserWindow,
  shell,
  type App,
  type BaseWindowConstructorOptions,
} from "electron";
import path from "node:path";
import { attachNavigationEvents } from "./main/ipc-handlers";
import { RUNTIME_APP_ICON } from "./branding";
import { IS_DEV } from "./env";

/**
 * Title-bar row height in CSS pixels. Must match
 * {@link editor/scaffolds/desktop/chrome/title-bar.tsx::TITLEBAR_HEIGHT_PX} —
 * the renderer's `<TitleBar>` reserves the same row so the OS-rendered
 * Min/Max/Close controls (Windows / Linux) sit flush with the
 * renderer's chrome. Tailwind `h-10` = 40px on both ends.
 */
const TITLE_BAR_HEIGHT = 40;

const trafficLightPosition = {
  x: 14,
  y: 14,
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

function get_window_constructor_options(): BaseWindowConstructorOptions {
  const icon = WINDOW_ICON[process.platform];
  const size = {
    width: 1440,
    height: 960,
    minWidth: 384,
    minHeight: 384,
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
 * Whitelisted: same-origin `/desktop` and `/desktop/*` paths only.
 * OAuth handoff leaves the desktop window via `shell.openExternal`.
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

  window.webContents.on("did-navigate-in-page", (_event, target) => {
    if (isAllowedNavigation(baseUrl, target)) return;
    console.warn(
      `[grida] blocked in-page navigation outside /desktop: ${target}`
    );
    void window.loadURL(`${baseUrl}/desktop/welcome`);
  });
}

function isAllowedNavigation(baseUrl: string, target: string): boolean {
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

export default function create_main_window({
  base_url: baseUrl,
  urlPath = "/desktop/welcome",
  title = "Grida",
  additionalArguments = [],
}: {
  base_url: string;
  urlPath?: string;
  title?: string;
  additionalArguments?: string[];
}) {
  const window = new BrowserWindow({
    ...get_window_constructor_options(),
    title,
    webPreferences: {
      // GRIDA-SEC-004 Electron hardening.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "preload.js"),
      additionalArguments,
    },
  });

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

  window.loadURL(`${baseUrl}${urlPath}`);

  register_window_hooks(window, { base_url: baseUrl });

  // Per-window nav-history push channel. `did-navigate*` are queued
  // asynchronously, so attaching synchronously after `loadURL` still
  // catches the initial-load event — matches how `register_window_hooks`
  // installs `will-navigate` above.
  attachNavigationEvents(window);

  return window;
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
 * The single canonical "open the welcome window" call. `main.ts` uses
 * it on `ready` and `activate`; `menu.ts` uses it for "File → New
 * Window". Centralising keeps desktop window arguments constrained to
 * non-secret host facts.
 */
export function open_welcome_window({
  app,
  base_url: baseUrl,
}: {
  app: App;
  base_url: string;
}) {
  return create_main_window({
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
  return create_main_window({
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
  return create_main_window({
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
  return create_main_window({
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
 * `canvas.json`. Dedup is the caller's job (focus an existing
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
  return create_main_window({
    base_url: baseUrl,
    urlPath: `/desktop/file?id=${encodeURIComponent(workspaceId)}`,
    additionalArguments: buildDesktopArguments({ app }),
  });
}
