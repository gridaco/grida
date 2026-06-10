/**
 * The pinned page origin of the browser-engine system harness.
 *
 * Vitest browser mode serves the test page from a local web server; that
 * page's origin is the browser client under test. The port is PINNED so
 * the harness AgentHost can allowlist the origin (CORS + Referer are
 * origin checks — a random port would make the allowlist a moving
 * target). Shared by `vitest.browser.config.ts` (page server) and
 * `browser-harness.global.ts` (host allowlist).
 */
export const BROWSER_HARNESS_PORT = 51730;

export const BROWSER_HARNESS_ORIGINS = [
  `http://localhost:${BROWSER_HARNESS_PORT}`,
  `http://127.0.0.1:${BROWSER_HARNESS_PORT}`,
] as const;
