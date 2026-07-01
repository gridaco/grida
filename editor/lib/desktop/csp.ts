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

//   connect-src allows:
//   - 'self'              — grida.co (prod) / localhost:3000 (dev)
//   - http://127.0.0.1:*  — the agent sidecar
//   - localhost/ws(s)     — Next.js dev HMR ONLY; gated out of prod so a
//                          renderer/XSS bug can't probe arbitrary local services
const DESKTOP_CSP_CONNECT_SRC = IS_DEV
  ? `connect-src 'self' http://127.0.0.1:* http://localhost:* ws://localhost:* wss://localhost:*; `
  : `connect-src 'self' http://127.0.0.1:*; `;

/**
 * GRIDA-SEC-004 carve-out — the Grida Library is FIRST-PARTY storage (the app's
 * own Supabase bucket, `NEXT_PUBLIC_SUPABASE_URL`). Its public image URLs
 * (`getPublicUrl` → that origin) are the reference images the user picks in the
 * artwork-station gather step; they are kept as URLs and rendered directly, so
 * the one first-party origin is allowlisted in `img-src` (image only).
 *
 * This is NOT a generation-provider CDN: GENERATED media (fal/openrouter/…) is
 * still sidecar bytes via `data:`/`blob:`/`grida-workspace:` and those hosts stay
 * excluded (pinned by `proxy.test.ts`). Derived from env at module load; empty
 * (omitted) when unset — a malformed value can't widen the policy.
 */
/**
 * Reduce an arbitrary string to a single bare `scheme://host[:port]` origin, or
 * "" if it isn't a valid absolute URL. This is the ONLY way a value reaches the
 * `img-src` carve-out — so a caller (or a malformed env) can never smuggle in
 * multiple sources or extra CSP directives (`; script-src …`): a value with a
 * space or `;` fails `new URL()` or is stripped down to just its origin.
 */
function normalizeLibraryImgOrigin(value: string): string {
  if (!value) return "";
  try {
    const origin = new URL(value).origin;
    return origin === "null" ? "" : origin;
  } catch {
    return "";
  }
}

const LIBRARY_IMG_ORIGIN = normalizeLibraryImgOrigin(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
);

/** `img-src` with the first-party library origin appended when present. The
 *  origin is re-normalized here so the directive is safe regardless of caller. */
function imgSrcDirective(libraryImgOrigin: string): string {
  // `grida-workspace:` is the privileged streaming scheme for workspace media
  // (#924): the main process serves it by proxying to the sidecar's
  // `/workspaces/file` route (Range-capable, no 1 MiB base64 cap). It's a local
  // privileged origin, NOT an external host.
  const base = "img-src 'self' data: blob: grida-workspace:";
  const origin = normalizeLibraryImgOrigin(libraryImgOrigin);
  return origin ? `${base} ${origin}` : base;
}

/**
 * Build the desktop CSP header for a given per-request nonce. The contract test
 * pins the directive set so a new renderer-loaded resource type (e.g. another
 * media modality) can't silently fall back to `default-src` and break at
 * runtime — the way video did before `media-src` was added (#908).
 *
 * `libraryImgOrigin` defaults to the env-derived first-party library origin; the
 * contract test passes an explicit value to pin both the allow (library host)
 * and the deny (generation-provider hosts).
 */
export function buildDesktopCsp(
  nonce: string,
  libraryImgOrigin: string = LIBRARY_IMG_ORIGIN
): string {
  return (
    DESKTOP_CSP_PREFIX +
    nonce +
    `${DESKTOP_CSP_SCRIPT_TAIL}; ` +
    // Tailwind's runtime classes still flow through `<style>` tags Next.js emits
    // at build/SSR — keep `'unsafe-inline'` for now; tightening style-src is a
    // separate change.
    `style-src 'self' 'unsafe-inline'; ` +
    `${imgSrcDirective(libraryImgOrigin)}; ` +
    // media-src for BYOK video (#908): clips are downloaded by the sidecar and
    // handed to the renderer as base64 `data:`/`blob:` — never streamed from an
    // external origin (no provider hosts added). `grida-workspace:` (#924)
    // additionally streams local workspace media.
    `media-src 'self' data: blob: grida-workspace:; ` +
    `font-src 'self' data:; ` +
    DESKTOP_CSP_CONNECT_SRC +
    `frame-ancestors 'none'; ` +
    `object-src 'none'; ` +
    `base-uri 'self'; ` +
    `form-action 'self'`
  );
}
