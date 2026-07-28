/**
 * GRIDA-SEC-004 / GRIDA-SEC-005 — `grida://` deep-link router.
 *
 * Auth callback (GRIDA-SEC-005): `grida://auth/callback?code=…` carries the
 * single-use PKCE `code` back from the system browser after the desktop
 * sign-in ceremony. The router performs NO code exchange and holds no auth
 * state — it only reconstructs a fixed same-origin
 * `/desktop/auth/callback` intent for the entry controller. The route exchange
 * succeeds solely against the PKCE verifier cookie already held by the
 * Electron cookie jar (minted by `/desktop/auth/start`). An unsolicited,
 * replayed, or attacker-crafted link therefore fails safe: at worst the app
 * focuses and lands on its own sign-in error page. This native generation adds
 * the fixed `native_entry=1` provenance marker so the hosted callback can
 * distinguish it from older binaries without trusting custom-scheme input.
 *
 * Future deep links (`grida://open/...`, provider callbacks, etc.) land here
 * as explicit switch arms with their own trust-boundary review.
 *
 * This module only parses untrusted protocol input into a closed native
 * intent. It never searches for or navigates a BrowserWindow. The entry-flow
 * controller owns the one exact window that may consume an auth callback.
 */
import { EDITOR_BASE_URL } from "../env";
import { DEEP_LINK_SCHEMES } from "../deep-link";

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
const AUTH_CALLBACK_NATIVE_ENTRY_MARKER = ["native_entry", "1"] as const;

function authCallbackTarget(parsed: URL): string {
  const target = new URL("/desktop/auth/callback", EDITOR_BASE_URL);
  for (const key of AUTH_CALLBACK_FORWARDED_PARAMS) {
    const value = parsed.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  // Set this after forwarding so even a future allowlist mistake cannot let
  // custom-scheme input choose or clear the native capability marker.
  target.searchParams.set(...AUTH_CALLBACK_NATIVE_ENTRY_MARKER);
  return target.toString();
}

export namespace protocol_router {
  export type Route =
    | { kind: "auth-callback"; callback_url: string }
    | { kind: "ignored" };

  /**
   * Parse one `grida://` URL. Every result is consumed exactly once; ignored
   * inputs are never placed in a polling/retry loop.
   */
  export function route(raw: string): Route {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      console.warn("[grida] malformed deep link ignored");
      return { kind: "ignored" };
    }
    // GRIDA-SEC-005 / #955 — accept every scheme Grida owns (`grida:` prod,
    // `grida-dev:` local); the OS delivers only the scheme registered by this
    // build, while identical parsing keeps the boundary env-agnostic.
    if (!DEEP_LINK_SCHEMES.some((scheme) => parsed.protocol === `${scheme}:`)) {
      console.warn(
        `[grida] unrecognized protocol, ignoring: ${parsed.protocol}`
      );
      return { kind: "ignored" };
    }
    // Custom-scheme hosts are not lowercased by the URL parser. Normalize so a
    // valid callback is never silently dropped on a case-varied invocation.
    switch (parsed.hostname.toLowerCase()) {
      case "auth": {
        if (parsed.pathname !== "/callback") {
          console.warn(`[grida] unknown auth deep link: ${parsed.pathname}`);
          return { kind: "ignored" };
        }
        return {
          kind: "auth-callback",
          callback_url: authCallbackTarget(parsed),
        };
      }
      default: {
        console.log(`[grida] deep link host not handled: ${parsed.hostname}`);
        return { kind: "ignored" };
      }
    }
  }
}
