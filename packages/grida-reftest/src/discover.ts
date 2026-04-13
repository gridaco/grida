import * as fs from "node:fs";
import * as path from "node:path";
import fg from "fast-glob";
import type { TestPair } from "./types.js";

/** Options for {@link discoverPairs}. */
export interface DiscoverOptions {
  /** Directory of actual (rendered) PNGs — the source of truth for the test set. */
  actualDir: string;
  /** Directory of expected (oracle) PNGs. */
  expectedDir: string;
  /** Glob, relative to `actualDir`. Defaults to `**\/*.png`. */
  pattern?: string;
  /**
   * Optional filter on generated test names. If the pattern ends with `*`
   * it's treated as a prefix; otherwise it's a substring match. Mirrors
   * `crates/grida-dev/src/reftest/runner.rs` filter semantics.
   */
  filter?: string;
}

/** Result row from {@link discoverPairs}. */
export interface DiscoveredPair extends TestPair {
  /** True if the expected file was found on disk at the expected path. */
  expectedExists: boolean;
}

/**
 * Walk `actualDir` with the given glob and build TestPair rows by joining
 * each actual PNG with its relative-path counterpart under `expectedDir`.
 *
 * Pairs where the expected counterpart is missing are still returned with
 * `expectedExists: false` — the runner routes them to the `err` bucket
 * (mirrors Rust behavior where missing pairs become failed test rows).
 *
 * Expected-only files (no actual counterpart) are intentionally ignored:
 * the actual side is the source of truth.
 */
export async function discoverPairs(
  opts: DiscoverOptions
): Promise<DiscoveredPair[]> {
  const pattern = opts.pattern ?? "**/*.png";
  const actualDir = path.resolve(opts.actualDir);
  const expectedDir = path.resolve(opts.expectedDir);

  if (!fs.existsSync(actualDir)) {
    throw new Error(`actual-dir does not exist: ${actualDir}`);
  }
  if (!fs.existsSync(expectedDir)) {
    throw new Error(`expected-dir does not exist: ${expectedDir}`);
  }

  const [actualRels, expectedRels] = await Promise.all([
    fg(pattern, {
      cwd: actualDir,
      onlyFiles: true,
      dot: false,
      caseSensitiveMatch: true,
    }),
    // Glob the expected side once so per-pair existence is a Set lookup
    // instead of one `fs.existsSync` syscall per discovered actual.
    fg("**/*.png", {
      cwd: expectedDir,
      onlyFiles: true,
      dot: false,
      caseSensitiveMatch: true,
    }),
  ]);

  const expectedSet = new Set(expectedRels);
  const pairs: DiscoveredPair[] = [];
  for (const rel of actualRels.sort()) {
    const name = nameForRelPath(rel);
    if (opts.filter && !filterMatches(name, opts.filter)) continue;
    pairs.push({
      name,
      actualPath: path.join(actualDir, rel),
      expectedPath: path.join(expectedDir, rel),
      expectedExists: expectedSet.has(rel),
    });
  }
  return pairs;
}

/**
 * Compute a test-name stem from a glob-relative PNG path.
 *
 * Examples (matches Rust runner naming):
 *   `1_5216.png`          → `1_5216`
 *   `shapes/circle.png`   → `shapes_circle`
 *   `a/b/c.png`           → `a_b_c`
 */
export function nameForRelPath(rel: string): string {
  const normalized = rel.replace(/\\/g, "/"); // win → posix
  const stripped = normalized.endsWith(".png")
    ? normalized.slice(0, -4)
    : normalized;
  return stripped.replace(/\//g, "_");
}

/**
 * Filter semantics from `runner.rs`: trailing `*` = prefix match,
 * otherwise substring match. Non-glob: no brace/bracket expansion.
 */
export function filterMatches(name: string, filter: string): boolean {
  const f = filter.trim();
  if (f.endsWith("*")) return name.startsWith(f.slice(0, -1));
  return name.includes(f);
}
