/**
 * GRIDA-SEC-004 / GRIDA-SEC-005 — `grida://` deep-link router.
 *
 * Auth callback (GRIDA-SEC-005): `grida://auth/callback?code=…` carries the
 * single-use PKCE `code` back from the system browser after the desktop
 * sign-in ceremony. The router performs NO code exchange and holds no auth
 * state — it only navigates a desktop window to the same-origin
 * `/desktop/auth/callback` route, where the exchange succeeds solely against
 * the PKCE verifier cookie already held by the Electron cookie jar (minted
 * by `/desktop/auth/start`). An unsolicited, replayed, or attacker-crafted
 * link therefore fails safe: at worst the app focuses and lands on its own
 * sign-in error page.
 *
 * Future deep links (`grida://open/...`, provider callbacks, etc.) land here
 * as explicit switch arms with their own trust-boundary review.
 */
import { BrowserWindow } from "electron";
import { EDITOR_BASE_URL } from "../env";
import { findWindowByUrl } from "./window-focus";

/**
 * Query params forwarded from the deep link to the callback route. `code` is
 * the PKCE code; the `error*` params are GoTrue's provider-failure report
 * (user denied, expired flow). Nothing else crosses the boundary — the
 * navigation target path is fixed.
 */
const AUTH_CALLBACK_FORWARDED_PARAMS = [
  "code",
  "error",
  "error_code",
  "error_description",
] as const;

/**
 * Prefer the window that is waiting on the sign-in page, then the focused
 * window, then any window. Returns `null` when the app has no windows (e.g.
 * macOS with all windows closed) — the user re-initiates from a fresh
 * window; an unconsumed deep link must not spawn UI.
 */
function pickAuthWindow(): BrowserWindow | null {
  return (
    findWindowByUrl("/desktop/auth/sign-in") ??
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ??
    null
  );
}

function routeAuthCallback(parsed: URL): void {
  const target = new URL("/desktop/auth/callback", EDITOR_BASE_URL);
  for (const key of AUTH_CALLBACK_FORWARDED_PARAMS) {
    const value = parsed.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }

  const window = pickAuthWindow();
  if (!window) {
    console.warn("[grida] auth deep link arrived with no window; dropping");
    return;
  }
  if (window.isMinimized()) window.restore();
  window.focus();
  void window.loadURL(target.toString());
}

/**
 * Route a `grida://` URL. Returns `true` when the URL was consumed and
 * should not be retried by the main-process queue. Every branch returns
 * `true` — returning `false` re-queues the URL indefinitely (see the drain
 * loop in `main.ts`).
 */
export async function routeDeepLink(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn(`[grida] malformed deep link, ignoring: ${url}`);
    return true;
  }
  if (parsed.protocol !== "grida:") {
    console.warn(`[grida] non-grida protocol, ignoring: ${parsed.protocol}`);
    return true;
  }
  switch (parsed.hostname) {
    case "auth": {
      if (parsed.pathname !== "/callback") {
        console.warn(`[grida] unknown auth deep link: ${parsed.pathname}`);
        return true;
      }
      routeAuthCallback(parsed);
      return true;
    }
    default: {
      console.log(`[grida] deep link host not handled: ${parsed.hostname}`);
      return true;
    }
  }
}
