// Public entry point for `@grida/reftest`.
//
// The programmatic API is a thin wrapper over the same file-based runner
// the CLI uses. The only branching is whether the caller provided an
// already-rendered `actualDir`, or a `renderOne` callback that fills a
// scratch directory on demand. In both cases the diff/score/report code
// reads PNGs from disk — there is no separate in-memory code path. This
// is critical: it's what guarantees the CLI and the programmatic API
// produce byte-identical reports.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import fg from "fast-glob";
import { compareFiles, loadPng } from "./compare.js";
import { nameForRelPath } from "./discover.js";
import { runSuite, type RunSuiteOptions } from "./runner.js";
import type {
  BgColor,
  CompareOptions,
  CompareResult,
  ReftestReport,
  ScoringMask,
} from "./types.js";

export * from "./types.js";
export { bucketForScore } from "./score.js";
export { discoverPairs, nameForRelPath } from "./discover.js";
export { loadSuiteConfig, parseSuiteConfig } from "./config.js";
export {
  buildReport,
  serializeReport,
  deserializeReport,
  writeReportFile,
} from "./report.js";
export { compareFiles, loadPng } from "./compare.js";
export { runSuite } from "./runner.js";
export type { RunSuiteOptions, ProgressEvent } from "./runner.js";
export type { DiscoveredPair, DiscoverOptions } from "./discover.js";

/** A discovered test case passed to a `renderOne` callback. */
export interface TestCaseContext {
  /** Path-relative name with `/` → `_` and `.png` stripped. */
  name: string;
  /** Path-relative stem (e.g. `shapes/circle`). */
  relPath: string;
  /** Absolute path to the oracle PNG on disk. */
  expectedPath: string;
  /** Size read from the oracle PNG (useful when rendering to match). */
  expectedSize: { width: number; height: number };
}

/** Options for the high-level {@link reftest} function. */
export type ReftestOptions = ReftestOptionsBase &
  (ReftestOptionsFile | ReftestOptionsCallback);

interface ReftestOptionsBase {
  /** Display name for the suite. Defaults to the basename of expectedDir. */
  name?: string;
  /** Oracle PNG directory. Required. */
  expectedDir: string;
  /** Bucket + report.json destination. Required. */
  outputDir: string;
  /** Inputs glob (relative to actualDir / scratch dir). Defaults to `**\/*.png`. */
  pattern?: string;
  /** Filter on test names (prefix if trailing `*`, else substring). */
  filter?: string;
  /** Clear outputDir on start. Default true. */
  overwrite?: boolean;
  /** Diff / scoring settings. */
  diff?: {
    threshold?: number;
    aa?: boolean;
  };
  scoring?: {
    mask?: ScoringMask;
  };
  bg?: BgColor;
  /** Optional progress callback, fires after each pair. */
  onProgress?: RunSuiteOptions["onProgress"];
}

interface ReftestOptionsFile {
  /** Already-rendered actuals on disk. */
  actualDir: string;
  renderOne?: never;
}

interface ReftestOptionsCallback {
  actualDir?: never;
  /**
   * Called once per discovered test case. Must return a PNG byte buffer.
   * The buffer is written to a scratch directory before the normal
   * file-based diff path runs — so callers see the same buckets, report,
   * and disk artifacts as the CLI.
   */
  renderOne: (ctx: TestCaseContext) => Promise<Buffer | Uint8Array>;
}

/**
 * Run a reference test suite and return the resulting report.
 *
 * Usage 1 — file-based (renderer ran out-of-band):
 * ```ts
 * const report = await reftest({
 *   name: "refig-standard",
 *   expectedDir: "./exports",
 *   actualDir:   "./renders",
 *   outputDir:   "./target/reftests/refig-standard",
 *   diff: { threshold: 0.1, aa: true },
 *   scoring: { mask: "alpha" },
 *   bg: "white",
 * });
 * ```
 *
 * Usage 2 — callback-based (in-process render):
 * ```ts
 * const report = await reftest({
 *   name: "refig-standard",
 *   expectedDir: "./exports",
 *   outputDir:   "./target/reftests/refig-standard",
 *   renderOne: async (testCase) => renderMyThing(testCase),
 * });
 * ```
 */
export async function reftest(opts: ReftestOptions): Promise<ReftestReport> {
  const name = opts.name ?? path.basename(path.resolve(opts.expectedDir));

  if ("actualDir" in opts && opts.actualDir) {
    return runSuite(
      toRunSuiteOptions(opts, name, opts.actualDir, opts.expectedDir)
    );
  }

  if (!("renderOne" in opts) || !opts.renderOne) {
    throw new Error("reftest: must provide either actualDir or renderOne");
  }

  // Render path: walk the oracle side, invoke renderOne for each case, and
  // write the returned buffers into a scratch actualDir. Then hand off to
  // the file-based runner so CLI and library produce identical reports.
  const scratch = fs.mkdtempSync(
    path.join(os.tmpdir(), "grida-reftest-render-")
  );
  const expectedDir = path.resolve(opts.expectedDir);
  const pattern = opts.pattern ?? "**/*.png";

  const rels = (
    await fg(pattern, { cwd: expectedDir, onlyFiles: true, dot: false })
  ).sort();

  for (const rel of rels) {
    const expectedPath = path.join(expectedDir, rel);
    const decoded = await loadPng(expectedPath);
    const ctx: TestCaseContext = {
      name: nameForRelPath(rel),
      relPath: rel.replace(/\.png$/i, ""),
      expectedPath,
      expectedSize: { width: decoded.width, height: decoded.height },
    };
    const png = await opts.renderOne(ctx);
    const actualPath = path.join(scratch, rel);
    fs.mkdirSync(path.dirname(actualPath), { recursive: true });
    fs.writeFileSync(actualPath, png);
  }

  return runSuite(toRunSuiteOptions(opts, name, scratch, expectedDir));
}

/** Ad-hoc single-pair compare. Thin wrapper over {@link compareFiles}. */
export async function compare(opts: {
  actual: string;
  expected: string;
  threshold?: number;
  aa?: boolean;
  bg?: BgColor;
  mask?: ScoringMask;
  diffOutputPath?: string;
}): Promise<CompareResult> {
  const { actual, expected, ...rest } = opts;
  return compareFiles(actual, expected, rest as CompareOptions);
}

function toRunSuiteOptions(
  opts: ReftestOptionsBase,
  name: string,
  actualDir: string,
  expectedDir: string
): RunSuiteOptions {
  return {
    name,
    actualDir,
    expectedDir,
    outputDir: opts.outputDir,
    pattern: opts.pattern,
    filter: opts.filter,
    threshold: opts.diff?.threshold,
    aa: opts.diff?.aa,
    bg: opts.bg,
    mask: opts.scoring?.mask,
    overwrite: opts.overwrite,
    onProgress: opts.onProgress,
  };
}

/** Version marker (pre-release). */
export const VERSION = "0.0.0";
