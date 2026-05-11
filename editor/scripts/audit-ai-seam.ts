#!/usr/bin/env tsx
/**
 * AI seam audit — GRIDA-SEC-003.
 *
 * Belt-and-suspenders to oxlint `no-restricted-imports`: greps the
 * editor tree for direct imports of AI provider SDKs from any file
 * outside the seam allowlist, and exits non-zero on any violation.
 *
 * Catches:
 *   1. Files added with `// oxlint-disable` that suppress the lint
 *      rule.
 *   2. New files added in directories the lint config doesn't cover.
 *   3. Globbing edge cases (lint configs and CI greps can drift).
 *
 * The lint rule is the first line of defense; this script is the
 * second. Runs in CI as a separate step from `pnpm lint`.
 *
 * Usage:
 *   tsx editor/scripts/audit-ai-seam.ts
 *
 * Exit codes:
 *   0 — clean (no violations).
 *   1 — at least one violation found.
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const EDITOR_ROOT = path.resolve(__filename, "..", "..");

/**
 * Files that ARE allowed to import provider SDKs. Mirrors the override
 * list in `editor/.oxlintrc.jsonc`. Keep these two in sync.
 */
const ALLOWLIST = [
  "lib/ai/server.ts",
  "lib/ai/models.ts",
  "grida-canvas-hosted/ai/agent/server-agent.ts",
  "app/(api)/private/ai/models/openai/route.ts",
];

/**
 * Provider-SDK packages that may only be imported from allowlisted files.
 * Mirrors the lint rule's `paths` + `patterns.group`.
 */
const FORBIDDEN_PACKAGES = [
  "replicate",
  "openai",
  "@anthropic-ai/sdk",
  "@ai-sdk/openai",
  "@ai-sdk/anthropic",
  "@ai-sdk/google",
  "@ai-sdk/google-vertex",
  "@ai-sdk/amazon-bedrock",
  "@ai-sdk/azure",
  "@ai-sdk/cohere",
  "@ai-sdk/groq",
  "@ai-sdk/mistral",
  "@ai-sdk/perplexity",
  "@ai-sdk/replicate",
  "@ai-sdk/xai",
];

// `import ... from "<pkg>"` and `require("<pkg>")` (both value-position).
// Allows type-only imports — those are safe (no runtime call).
function buildPattern(pkg: string): RegExp {
  const escaped = pkg.replace(/[/.\-@]/g, (m) => `\\${m}`);
  return new RegExp(
    String.raw`(?:^|\n)\s*(?:import(?!\s+type)\b[^;\n]*from\s+|require\s*\()['"]` +
      escaped +
      String.raw`['"]`,
    "g"
  );
}

const PATTERNS = FORBIDDEN_PACKAGES.map((pkg) => ({
  pkg,
  re: buildPattern(pkg),
}));

type Violation = { file: string; line: number; pkg: string; snippet: string };

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "out",
  "build",
  ".turbo",
  ".vercel",
]);

async function walk(dir: string, acc: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== "." && e.name !== "..") {
      // Skip dotfiles/dot-dirs (but the route group dirs `(api)` etc. are fine).
      if (e.isDirectory()) continue;
    }
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      await walk(full, acc);
      continue;
    }
    if (!e.isFile()) continue;
    if (e.name.endsWith(".d.ts")) continue;
    const ext = path.extname(e.name);
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    acc.push(full);
  }
}

async function main(): Promise<number> {
  const files: string[] = [];
  await walk(EDITOR_ROOT, files);

  const allowlistSet = new Set(ALLOWLIST.map((p) => path.normalize(p)));
  const violations: Violation[] = [];

  await Promise.all(
    files.map(async (full) => {
      const relPath = path.relative(EDITOR_ROOT, full);
      const norm = path.normalize(relPath);
      if (allowlistSet.has(norm)) return;

      const source = await readFile(full, "utf8");
      for (const { pkg, re } of PATTERNS) {
        re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(source))) {
          const line = source.slice(0, match.index).split("\n").length;
          const snippet = source.slice(match.index).split("\n", 1)[0]!.trim();
          violations.push({ file: relPath, line, pkg, snippet });
        }
      }
    })
  );

  if (violations.length === 0) {
    console.log(
      `✓ ai-seam audit clean: ${files.length} files scanned, 0 violations.`
    );
    return 0;
  }

  console.error(
    `✗ ai-seam audit FAILED with ${violations.length} violation(s):`
  );
  console.error("");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    package: ${v.pkg}`);
    console.error(`    ${v.snippet}`);
    console.error("");
  }
  console.error("GRIDA-SEC-003: AI provider SDKs must be imported only from");
  console.error("editor/lib/ai/server.ts (and the seam allowlist).");
  console.error("Update either the import site OR the allowlist in BOTH:");
  console.error("  - editor/.oxlintrc.jsonc  (override.files)");
  console.error("  - editor/scripts/audit-ai-seam.ts  (ALLOWLIST const)");
  return 1;
}

main().then((code) => process.exit(code));
