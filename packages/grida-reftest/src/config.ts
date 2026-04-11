import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import type { BgColor, ScoringMask, SuiteConfig } from "./types.js";

/**
 * Load and parse a `reftest.toml` or `reftest.json` from a suite directory.
 *
 * The schema mirrors `crates/grida-dev/src/reftest/config.rs`, minus the
 * `type` field (which Rust kept but never used). The new nested shape is
 * preferred:
 *
 * ```toml
 * [test]
 * name = "refig-standard"
 * inputs = "renders/**\/*.png"
 * expects = "exports"
 * bg = "white"
 *
 * [test.diff]
 * aa = true
 * threshold = 0.1
 *
 * [test.scoring]
 * mask = "alpha"
 * ```
 *
 * Legacy top-level fields (`name`, `inputs`, `expects`, `bg`, `[diff]`) are
 * also accepted so configs written for the Rust tool round-trip cleanly.
 *
 * Returns null if neither file exists. Throws on parse/validation error.
 */
export function loadSuiteConfig(suiteDir: string): SuiteConfig | null {
  const tomlPath = path.join(suiteDir, "reftest.toml");
  const jsonPath = path.join(suiteDir, "reftest.json");

  if (fs.existsSync(tomlPath)) {
    const raw = fs.readFileSync(tomlPath, "utf8");
    const obj = parseToml(raw) as Record<string, unknown>;
    return normalize(obj, tomlPath);
  }
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return normalize(obj, jsonPath);
  }
  return null;
}

/** Parse a TOML or JSON config from a raw string. Exposed for testing. */
export function parseSuiteConfig(
  raw: string,
  format: "toml" | "json",
  sourceHint = "<string>"
): SuiteConfig {
  const obj =
    format === "toml"
      ? (parseToml(raw) as Record<string, unknown>)
      : (JSON.parse(raw) as Record<string, unknown>);
  return normalize(obj, sourceHint);
}

function normalize(obj: Record<string, unknown>, source: string): SuiteConfig {
  // Pick nested [test] first, fall back to top-level (legacy).
  const test = (obj.test as Record<string, unknown> | undefined) ?? obj;
  const out: SuiteConfig = {};

  const name = pickString(test.name) ?? pickString(obj.name);
  if (name !== undefined) out.name = name;

  const inputs = pickString(test.inputs) ?? pickString(obj.inputs);
  if (inputs !== undefined) out.inputs = inputs;

  const expects = pickString(test.expects) ?? pickString(obj.expects);
  if (expects !== undefined) out.expects = expects;

  const bgRaw = pickString(test.bg) ?? pickString(obj.bg);
  if (bgRaw !== undefined) {
    const bg = coerceBg(bgRaw, source);
    out.bg = bg;
  }

  const diffRaw =
    (test.diff as Record<string, unknown> | undefined) ??
    (obj.diff as Record<string, unknown> | undefined);
  if (diffRaw) {
    const diff: SuiteConfig["diff"] = {};
    if (typeof diffRaw.aa === "boolean") diff.aa = diffRaw.aa;
    if (typeof diffRaw.threshold === "number")
      diff.threshold = diffRaw.threshold;
    if (Object.keys(diff).length > 0) out.diff = diff;
  }

  const scoringRaw = test.scoring as Record<string, unknown> | undefined;
  if (scoringRaw) {
    const maskRaw = pickString(scoringRaw.mask);
    if (maskRaw !== undefined) {
      const mask = coerceMask(maskRaw, source);
      out.scoring = { mask };
    }
  }

  return out;
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function coerceBg(v: string, source: string): BgColor {
  if (v === "white" || v === "black") return v;
  throw new Error(`${source}: invalid bg "${v}" (expected "white" or "black")`);
}

function coerceMask(v: string, source: string): ScoringMask {
  if (v === "alpha" || v === "none") return v;
  throw new Error(
    `${source}: invalid scoring.mask "${v}" (expected "alpha" or "none")`
  );
}
