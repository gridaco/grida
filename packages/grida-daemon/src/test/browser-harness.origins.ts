/**
 * The pinned page origin of the browser-engine system harness.
 *
 * Vitest browser mode serves the test page from a local web server; that
 * page's origin is the browser client under test. The port is PINNED so
 * the harness daemon can allowlist the origin (CORS + Referer are
 * origin checks — a random port would make the allowlist a moving
 * target). Shared by `vitest.browser.config.ts` (page server) and
 * `browser-harness.global.ts` (host allowlist).
 */
export const BROWSER_HARNESS_PORT = 51730;

export const BROWSER_HARNESS_ORIGINS = [
  `http://localhost:${BROWSER_HARNESS_PORT}`,
  `http://127.0.0.1:${BROWSER_HARNESS_PORT}`,
] as const;

/**
 * The STUB TENANT the harness mounts (browser-safe constants; the tenant
 * implementation lives in `browser-harness.global.ts`, Node side).
 *
 * The perimeter contract under test includes the tenant seam: a tenant
 * declares its GET SSE routes for `auth_token` query carriage
 * (GRIDA-SEC-004; `DaemonTenant.sse_query_token_paths`). A minimal stub
 * proves that mechanism without pulling any real tenant in — the agent
 * tenant's own routes are covered by `@grida/agent`'s Node tests.
 */
export const STUB_SSE_EVENT = "grida-stub" as const;
export const STUB_STREAM_PATH = "/stub/stream" as const;
export const STUB_ECHO_PATH = "/stub/echo" as const;
