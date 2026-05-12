import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";

// Auto-load env so `pnpm vitest run` works without `set -a; . ./.env.test.local`
// ceremony.
// Precedence (highest wins): shell > .env.test.local > .env.test > .env.local.
// `.env.local` is a fallback so tokens kept there for the dev server are also
// usable by the e2e suite without duplication. `loadEnvFile()` only sets a
// key when not already in process.env, so the precedence chain holds.
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
const dir = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(dir, ".env.test.local"));
loadEnvFile(path.join(dir, ".env.test"));
loadEnvFile(path.join(dir, ".env.local"));

// The billing E2E suite under `lib/billing/__tests__/e2e/` hits real Stripe
// (test mode) and the local webhook receiver. Slow, rate-limited, requires
// credentials. Excluded from default runs; gate with BILLING_E2E=1.
//
// Note: this is opt-in only. Do NOT set `BILLING_E2E=1` in committed env
// files — CI runs default `pnpm test` and has no Stripe credentials,
// so flipping the default would break CI.
const BILLING_E2E_GATE = process.env.BILLING_E2E === "1";

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` is a no-op shim under vitest — the runtime guard
      // it provides is unnecessary in tests, and the package itself
      // throws on import in non-Next contexts.
      "server-only": fileURLToPath(
        new URL("./lib/__tests__/server-only.shim.ts", import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      "**/.next/**",
      "**/dist/**",
      // Always exclude top-level `editor/e2e/` (Playwright suite — runs
      // via `pnpm test:e2e`, never under vitest).
      "e2e/**",
      // Billing E2E only runs when the gate is on.
      ...(BILLING_E2E_GATE ? [] : ["lib/billing/__tests__/e2e/**"]),
    ],
    // Billing E2E runs sequentially: shared Stripe rate limits and the
    // single local webhook receiver can't safely interleave.
    ...(BILLING_E2E_GATE
      ? {
          fileParallelism: false,
          sequence: { concurrent: false },
        }
      : {}),
  },
});
