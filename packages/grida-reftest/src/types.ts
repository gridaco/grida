// Shared TypeScript types for @grida/reftest.
//
// IMPORTANT: JSON report field names use snake_case (compat with Rust
// serde output from `crates/grida-dev/src/reftest/report.rs`). TS types
// use camelCase. Conversion happens at the IO boundary in src/report.ts.

export type BgColor = "white" | "black";
export type ScoringMask = "alpha" | "none";
export type Bucket = "S99" | "S95" | "S90" | "S75" | "err";

/** Result of comparing one pair of images. */
export interface CompareResult {
  /** 0.0 (completely different) to 1.0 (identical) */
  similarity: number;
  /** Percentage (0–100) of pixels that differ, scaled by the scoring mask. */
  diffPercentage: number;
  /** Count of pixels that differ per pixelmatch. */
  diffPixels: number;
  /** Denominator used for similarity: visible pixels (alpha mask) or w*h. */
  totalPixels: number;
  /** Image dimensions (guaranteed equal on actual and expected). */
  width: number;
  height: number;
  /** Non-null if the comparison failed (e.g. dimension mismatch). */
  error: string | null;
}

/** Options for the single-pair compare() API and `reftest compare` subcommand. */
export interface CompareOptions {
  /** pixelmatch YIQ threshold per pixel (0.0 strict … 1.0 very lenient). */
  threshold?: number;
  /** Ignore anti-aliased edges (pixelmatch includeAA=false). */
  aa?: boolean;
  /** Composite background color before diffing. */
  bg?: BgColor;
  /** Scoring denominator: visible pixels only, or all pixels. */
  mask?: ScoringMask;
  /** If provided, write the diff PNG to this path. */
  diffOutputPath?: string;
}

/** Discovered test pair (actual+expected). */
export interface TestPair {
  /** Display/bucket name. Path-relative with "/" → "_" and ".png" stripped. */
  name: string;
  /** Absolute path to the actual PNG on disk. */
  actualPath: string;
  /** Absolute path to the expected PNG on disk. */
  expectedPath: string;
}

/** One row in the JSON report (camelCase, converted to snake_case at IO). */
export interface TestResult {
  testName: string;
  similarityScore: number;
  diffPercentage: number;
  outputPng: string;
  diffPng: string | null;
  error: string | null;
}

/** Full report object (camelCase). */
export interface ReftestReport {
  total: number;
  averageSimilarity: number;
  minSimilarity: number;
  maxSimilarity: number;
  tests: TestResult[];
  /** Unix timestamp in seconds as string (mirrors Rust). */
  timestamp: string;
  suiteDir: string;
  outputDir: string;
}

/** Suite config (reftest.toml / reftest.json). */
export interface SuiteConfig {
  name?: string;
  /** Glob under suite-dir for actual PNGs (inputs). */
  inputs?: string;
  /** Directory under suite-dir for expected PNGs. */
  expects?: string;
  bg?: BgColor;
  diff?: {
    aa?: boolean;
    threshold?: number;
  };
  scoring?: {
    mask?: ScoringMask;
  };
}
