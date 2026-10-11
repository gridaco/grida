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
    ],
  },
});
