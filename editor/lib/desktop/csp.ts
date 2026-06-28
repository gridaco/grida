/**
 * GRIDA-SEC-004 — desktop Content-Security-Policy template.
 *
 * Lives outside `proxy.ts` because Next.js 16 only permits the proxy handler
 * and an optional `config` export there; any extra export (this helper) trips
 * route-export validation. `proxy.ts` and the CSP contract test
 * (`proxy.test.ts`) both import `buildDesktopCsp` from here.
 *
 * The template is hoisted so each `/desktop/*` request only interpolates the
 * per-request nonce (one concat) instead of rebuilding a 10-directive string.
 * The `'unsafe-eval'` tail is dev-only — pinned at module load.
 */

const IS_DEV = process.env.NODE_ENV === "development";

const DESKTOP_CSP_SCRIPT_TAIL = IS_DEV
  ? "' 'strict-dynamic' 'wasm-unsafe-eval' 'unsafe-eval'"
  : "' 'strict-dynamic' 'wasm-unsafe-eval'";

const DESKTOP_CSP_PREFIX = `default-src 'self'; script-src 'self' 'nonce-`;

const DESKTOP_CSP_SUFFIX =
  `${DESKTOP_CSP_SCRIPT_TAIL}; ` +
  // Tailwind's runtime classes still flow through `<style>` tags Next.js emits
  // at build/SSR — keep `'unsafe-inline'` for now; tightening style-src is a
  // separate change.
  `style-src 'self' 'unsafe-inline'; ` +
  `img-src 'self' data: blob:; ` +
  // media-src for BYOK video (#908): clips are downloaded by the sidecar and
  // handed to the renderer as base64 `data:`/`blob:` — never streamed from an
  // external origin (same trust level as img-src; no provider hosts added).
  `media-src 'self' data: blob:; ` +
  `font-src 'self' data:; ` +
  //   connect-src allows:
  //   - 'self'              — grida.co (prod) / localhost:3000 (dev)
  //   - http://127.0.0.1:*  — the agent sidecar
  //   - ws: http: localhost — Next.js dev HMR (harmless in prod, no
  //                          localhost service to attack)
  `connect-src 'self' http://127.0.0.1:* http://localhost:* ws://localhost:* wss://localhost:*; ` +
  `frame-ancestors 'none'; ` +
  `object-src 'none'; ` +
  `base-uri 'self'; ` +
  `form-action 'self'`;

/**
 * Build the desktop CSP header for a given per-request nonce. The contract test
 * pins the directive set so a new renderer-loaded resource type (e.g. another
 * media modality) can't silently fall back to `default-src` and break at
 * runtime — the way video did before `media-src` was added (#908).
 */
export function buildDesktopCsp(nonce: string): string {
  return DESKTOP_CSP_PREFIX + nonce + DESKTOP_CSP_SUFFIX;
}
