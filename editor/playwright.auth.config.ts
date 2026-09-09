// GRIDA-SEC-011 — explicit fixture runner; no fallback server or credential artifacts.
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// An existing isolated server is required. No dotenv or ordinary dev-server fallback.
const statePath = process.env.GRIDA_AUTH_TEST_STATE;
if (
  !statePath ||
  !path.isAbsolute(statePath) ||
  path.basename(statePath) !== "fixture.json" ||
  !/^grida-auth-test-[A-Za-z0-9]+$/.test(path.basename(path.dirname(statePath)))
) {
  throw new Error(
    "GRIDA_AUTH_TEST_STATE must name a prepared local auth fixture."
  );
}
const executablePath = process.env.GRIDA_AUTH_TEST_BROWSER_EXECUTABLE;
if (executablePath && !path.isAbsolute(executablePath)) {
  throw new Error(
    "The optional fixture browser executable must be an absolute path."
  );
}

export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
  testMatch: "auth-oauth.spec.mts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  globalTimeout: 360_000,
  expect: { timeout: 30_000 },
  reporter: "line",
  outputDir: path.join(path.dirname(statePath), "playwright-results"),
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3041",
    trace: "off",
    video: "off",
    screenshot: "off",
    serviceWorkers: "block",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
    },
  },
});
