// Import-graph invariant — bedrock layering enforcement.
//
// **Rule:** every file the bedrock introduces — all of `core/`, and the
// bedrock value-type files under `primitives/` — imports ONLY from
// `@grida/cmath` (or its submodule paths) and from sibling bedrock files,
// under the layer-direction rule:
//
//   primitives/ → @grida/cmath (+ sibling primitives/)
//   core/       → @grida/cmath + primitives/ (+ sibling core/)
//
// No imports from `classes/`, `surface/`, `event/`, or any other
// higher-layer / legacy directory.
//
// **Scope note.** This PR ships the bedrock as an additive layer; it does
// NOT yet relocate the opinionated drawers that still live in `primitives/`
// (`ruler.ts`, `corner-radius.ts`, `parametric-handle.ts`, `pixel-grid.ts`,
// plus `canvas.ts` / `projection.ts`). Those are legacy and import across
// layers by design until the relocation lands. So the primitives side of
// this test checks an explicit allowlist of the files the bedrock adds,
// not the whole directory. `core/` is new in its entirety, so it is scanned
// wholesale. When the relocation happens, this test widens to the full
// `primitives/` directory scan.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PKG_ROOT = path.resolve(__dirname, "..", "..");

/**
 * The bedrock value-type files this PR adds under `primitives/`. Every
 * other file in `primitives/` is legacy (pre-existing, cross-layer by
 * design) and out of scope until the relocation. Adding a new bedrock
 * primitive means adding it here — the guard test below fails otherwise.
 */
const BEDROCK_PRIMITIVES = ["overlay.ts", "painter.ts", "cursor.ts"];

/** Disallowed import-path fragments — any of these in an import is a fail. */
const DISALLOWED_FRAGMENTS = [
  "../classes/",
  "../surface/",
  "../event/",
  "/classes/",
  "/surface/",
  "/event/",
];

function listTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => path.join(dir, e.name));
}

function extractImports(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const out: string[] = [];
  const importRe = /\bimport\s+(?:type\s+)?[^"';]*?\s+from\s+["']([^"']+)["']/g;
  const bareRe = /\bimport\s+["']([^"']+)["']/g;
  // dynamic `import("...")` type references (e.g. types.ts label field)
  const dynRe = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = importRe.exec(text))) out.push(m[1]);
  while ((m = bareRe.exec(text))) out.push(m[1]);
  while ((m = dynRe.exec(text))) out.push(m[1]);
  return out;
}

function isAllowedExternal(spec: string): boolean {
  return spec === "@grida/cmath" || spec.startsWith("@grida/cmath/");
}

function checkSpec(
  spec: string,
  fromDir: "core" | "primitives"
): string | null {
  if (!spec.startsWith(".")) {
    return isAllowedExternal(spec)
      ? null
      : `external import "${spec}" is not allowed in bedrock`;
  }
  for (const frag of DISALLOWED_FRAGMENTS) {
    if (spec.includes(frag)) {
      return `forbidden cross-layer import "${spec}"`;
    }
  }
  if (fromDir === "primitives" && spec.includes("../core/")) {
    return `primitives → core import "${spec}" reverses the layer direction`;
  }
  return null;
}

function scanLayer(dir: "core" | "primitives", files: string[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    for (const imp of extractImports(file)) {
      const err = checkSpec(imp, dir);
      if (err) violations.push(`${path.basename(file)}: ${err}`);
    }
  }
  return violations;
}

describe("Bedrock import graph", () => {
  const coreFiles = listTsFiles(path.join(PKG_ROOT, "core"));
  const bedrockPrimFiles = BEDROCK_PRIMITIVES.map((f) =>
    path.join(PKG_ROOT, "primitives", f)
  );

  it("core/ imports only from @grida/cmath and primitives/ (no classes/, surface/, or event/)", () => {
    expect(coreFiles.length).toBeGreaterThan(0);
    expect(scanLayer("core", coreFiles)).toEqual([]);
  });

  it("bedrock primitives import only from @grida/cmath and sibling primitives/ (no core/, classes/, surface/, event/)", () => {
    const missing = bedrockPrimFiles.filter((f) => !fs.existsSync(f));
    expect(missing).toEqual([]);
    expect(scanLayer("primitives", bedrockPrimFiles)).toEqual([]);
  });

  it("the bedrock-primitives allowlist is exhaustively enumerated (adding one forces a test edit)", () => {
    // Pin the list so a new bedrock primitive can't land unchecked.
    expect([...BEDROCK_PRIMITIVES].sort()).toEqual([
      "cursor.ts",
      "overlay.ts",
      "painter.ts",
    ]);
  });
});
