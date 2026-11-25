/**
 * GRIDA-SEC-004 — desktop Content-Security-Policy template.
 *
 * Lives outside `proxy.ts` because Next.js 16 only permits the proxy handler
 * and an optional `config` export there; any extra export (this helper) trips
 * route-export validation. `proxy.ts` and the CSP contract test
 * (`proxy.test.ts`) both import `buildDesktopCsp` from here.
 *
 * The request supplies the script nonce. The `'unsafe-eval'` tail is
 * dev-only and fixed at module load.
 */

import { DesktopImagePolicy } from "@/lib/desktop/image-policy";

const IS_DEV = process.env.NODE_ENV === "development";

const DESKTOP_CSP_SCRIPT_TAIL = IS_DEV
  ? "' 'strict-dynamic' 'wasm-unsafe-eval' 'unsafe-eval'"
  : "' 'strict-dynamic' 'wasm-unsafe-eval'";

const DESKTOP_CSP_PREFIX = `default-src 'self'; script-src 'self' 'nonce-`;

//   connect-src allows:
//   - 'self'              — grida.co (prod) / localhost:3000 (dev)
//   - http://127.0.0.1:*  — the services sidecar
//   - localhost/ws(s)     — Next.js dev HMR ONLY; gated out of prod so a
//                          renderer/XSS bug can't probe arbitrary local services
const DESKTOP_CSP_CONNECT_SRC = IS_DEV
  ? `connect-src 'self' http://127.0.0.1:* http://localhost:* ws://localhost:* wss://localhost:*; `
  : `connect-src 'self' http://127.0.0.1:*; `;

/**
 * Build the desktop CSP header for a given per-request nonce. The contract test
 * pins the directive set so a new renderer-loaded resource type (e.g. another
 * media modality) can't silently fall back to `default-src` and break at
 * runtime — the way video did before `media-src` was added.
 *
 * `libraryImgOrigins` defaults to the selected first-party Library origins; the
 * contract test passes an explicit value to pin both the allow (library host)
 * and the deny (generation-provider hosts).
 */
export function buildDesktopCsp(
  nonce: string,
  libraryImgOrigins?: string | readonly string[]
): string {
  return (
    DESKTOP_CSP_PREFIX +
    nonce +
    `${DESKTOP_CSP_SCRIPT_TAIL}; ` +
    // Tailwind's runtime classes still flow through `<style>` tags Next.js emits
    // at build/SSR — keep `'unsafe-inline'` for now; tightening style-src is a
    // separate change.
    `style-src 'self' 'unsafe-inline'; ` +
    `img-src 'self' data: blob: grida-workspace: ${DesktopImagePolicy.sources(libraryImgOrigins).join(" ")}; ` +
    // The sidecar downloads BYOK video. The renderer plays those bytes from
    // `data:`/`blob:` alongside local workspace media and public FX showcase clips.
    `media-src 'self' data: blob: grida-workspace: ${DesktopImagePolicy.fxShowcase}; ` +
    `font-src 'self' data:; ` +
    DESKTOP_CSP_CONNECT_SRC +
    `frame-ancestors 'none'; ` +
    `object-src 'none'; ` +
    `base-uri 'self'; ` +
    `form-action 'self'`
  );
}
