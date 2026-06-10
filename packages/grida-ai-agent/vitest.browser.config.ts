/**
 * The browser-engine system harness (WG spec docs/wg/ai/agent/daemon.md
 * §conformance, issue #798).
 *
 * Node tests can forge any header, so they cannot prove what a browser
 * may actually do against the AgentHost perimeter. This config runs
 * `*.browser.test.ts` inside a REAL Chromium context (vitest browser
 * mode, playwright provider) against a REAL AgentHost booted by the
 * global setup on the Node side. It is a system harness for the HTTP
 * perimeter — not product e2e.
 *
 * The vitest page server port is PINNED so the page origin is a known
 * value the harness host can allowlist (CORS + Referer are origin
 * checks; a random port would make the allowlist a moving target).
 */
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { BROWSER_HARNESS_PORT } from "./src/test/browser-harness.origins";

export default defineConfig({
  test: {
    include: ["src/**/*.browser.test.ts"],
    globalSetup: ["./src/test/browser-harness.global.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      api: { port: BROWSER_HARNESS_PORT, strictPort: true },
      instances: [{ browser: "chromium" }],
    },
  },
});
