// Import-graph invariant — bedrock layering enforcement.
//
// **Rule:** the two published bedrock subpath entry points —
// `@grida/hud/core` (`core/index.ts`) and `@grida/hud/primitives`
// (`primitives/bedrock.ts`) — and their ENTIRE transitive closure of
// relative imports/re-exports must reference only `@grida/cmath` (or its
// submodules) and sibling bedrock files. Nothing in the closure may import
// from `classes/`, `surface/`, or the legacy `event/` directory.
//
// This walks the real module graph from each entry, following `import`,
// `export … from`, bare `import "…"`, and dynamic `import("…")` specifiers.
// Because it follows re-exports, it cannot be fooled by a barrel that
// re-exports a cross-layer module (the failure the previous allowlist-based
// version could not see): the `@grida/hud/primitives` subpath must NOT pull
// in the legacy drawers (`ruler.ts`, `corner-radius.ts`, …) that import from
// `event/`, which is precisely why `primitives/bedrock.ts` is a curated
// barrel distinct from `primitives/index.ts`.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PKG_ROOT = path.resolve(__dirname, "..", "..");

/** The published bedrock subpath entry points (see package.json `exports`). */
const ENTRIES = ["core/index.ts", "primitives/bedrock.ts"];

/**
 * Top-level package directories the bedrock must never reach. Checked
 * against the RESOLVED file path (not the raw specifier text), so a
 * non-canonical spelling that still resolves into one of these is caught.
 */
const FORBIDDEN_DIRS = ["classes", "surface", "event"];

/** Extensions a relative specifier may resolve to (superset of what the
 *  bundler accepts), plus index files — so a `.tsx`/`.mts` re-export edge
 *  is followed, never silently dropped. */
const RESOLVE_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs"];

function isAllowedExternal(spec: string): boolean {
  return spec === "@grida/cmath" || spec.startsWith("@grida/cmath/");
}

/** Is the resolved file inside a forbidden top-level package directory? */
function isForbidden(file: string): boolean {
  const top = path.relative(PKG_ROOT, file).split(path.sep)[0];
  return FORBIDDEN_DIRS.includes(top);
}

/** Extract every module specifier referenced by a source file. */
function extractSpecifiers(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    // import … from "x" / import type … from "x"
    /\bimport\s+(?:type\s+)?[^"';]*?\s+from\s+["']([^"']+)["']/g,
    // export … from "x" / export * from "x" / export type { … } from "x"
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\}|[^"';]*?)\s+from\s+["']([^"']+)["']/g,
    // bare import "x"
    /\bimport\s+["']([^"']+)["']/g,
    // dynamic import("x")
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
  }
  return out;
}

/** Resolve a relative specifier from `fromFile` to an on-disk source file,
 *  trying every accepted extension and an index file. Returns null only when
 *  nothing on disk matches. */
function resolveRelative(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const isFile = (c: string) => fs.existsSync(c) && fs.statSync(c).isFile();
  if (isFile(base)) return base; // spec already had an extension
  for (const ext of RESOLVE_EXTS) {
    if (isFile(base + ext)) return base + ext;
    if (isFile(path.join(base, `index${ext}`))) {
      return path.join(base, `index${ext}`);
    }
  }
  return null;
}

/** BFS the relative-import closure from `entry`, collecting violations.
 *  A relative specifier is a violation if it (a) resolves into a forbidden
 *  package directory, or (b) cannot be resolved at all — an unresolved edge
 *  is treated as a leak rather than silently skipped, so the guard can't be
 *  bypassed by an extension the resolver doesn't recognise. */
function walk(entry: string): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();
  const queue = [path.join(PKG_ROOT, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const rel = path.relative(PKG_ROOT, file);
    for (const spec of extractSpecifiers(fs.readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".")) {
        if (!isAllowedExternal(spec)) {
          violations.push(`${rel}: forbidden external import "${spec}"`);
        }
        continue;
      }
      const target = resolveRelative(file, spec);
      if (!target) {
        violations.push(`${rel}: unresolved relative import "${spec}"`);
        continue;
      }
      if (isForbidden(target)) {
        const dst = path.relative(PKG_ROOT, target);
        violations.push(`${rel}: cross-layer import "${spec}" → ${dst}`);
        continue;
      }
      queue.push(target);
    }
  }
  return violations;
}

describe("Bedrock import graph", () => {
  it("every published bedrock entry exists", () => {
    const missing = ENTRIES.filter(
      (e) => !fs.existsSync(path.join(PKG_ROOT, e))
    );
    expect(missing).toEqual([]);
  });

  for (const entry of ENTRIES) {
    it(`${entry} closure imports only @grida/cmath and sibling bedrock files (no classes/, surface/, event/)`, () => {
      expect(walk(entry)).toEqual([]);
    });
  }

  it("the @grida/hud/primitives closure excludes the legacy cross-layer drawers", () => {
    // Guard the specific regression the curated barrel exists to prevent:
    // primitives/bedrock.ts must NOT transitively reach ruler/corner-radius/
    // parametric-handle/pixel-grid/canvas/projection (all of which import
    // from event/ or classes/).
    const seen = new Set<string>();
    const queue = [path.join(PKG_ROOT, "primitives/bedrock.ts")];
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of extractSpecifiers(fs.readFileSync(file, "utf8"))) {
        if (spec.startsWith(".")) {
          const target = resolveRelative(file, spec);
          if (target) queue.push(target);
        }
      }
    }
    const reached = [...seen].map((f) => path.basename(f));
    for (const legacy of [
      "ruler.ts",
      "corner-radius.ts",
      "parametric-handle.ts",
      "pixel-grid.ts",
      "canvas.ts",
      "projection.ts",
    ]) {
      expect(reached).not.toContain(legacy);
    }
  });
});
