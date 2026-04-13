import * as fs from "node:fs";
import * as path from "node:path";
import { compareFiles } from "./compare.js";
import { discoverPairs, type DiscoveredPair } from "./discover.js";
import { mkdirp, rmrf } from "./fs-utils.js";
import { buildReport, writeReportFile } from "./report.js";
import { bucketForScore } from "./score.js";
import type {
  BgColor,
  ReftestReport,
  ScoringMask,
  TestResult,
} from "./types.js";

/** Inputs to the suite runner. */
export interface RunSuiteOptions {
  /** Display name for the suite; used in the report and (optionally) in output-dir. */
  name: string;
  /** Directory of actual (rendered) PNGs. */
  actualDir: string;
  /** Directory of expected (oracle) PNGs. */
  expectedDir: string;
  /** Directory to write buckets + report.json into. Cleared unless `overwrite === false`. */
  outputDir: string;
  /** Original suite-dir (for the report.json `suite_dir` field). Defaults to `actualDir`. */
  suiteDir?: string;
  /** Glob pattern relative to `actualDir`. Default: `**\/*.png`. */
  pattern?: string;
  /** Filter on test names (prefix if trailing `*`, substring otherwise). */
  filter?: string;
  /** Compare options. */
  threshold?: number;
  aa?: boolean;
  bg?: BgColor;
  mask?: ScoringMask;
  /** Clear output-dir on start (default true). */
  overwrite?: boolean;
  /** Optional progress callback, invoked after each pair. */
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  index: number;
  total: number;
  name: string;
  bucket: string;
  similarity: number;
  error: string | null;
}

/**
 * Produce actuals-vs-expected bucketed output + report.json for a single suite.
 * Output layout mirrors `crates/grida-dev/src/reftest/runner.rs`:
 * `<outputDir>/{S99,S95,S90,S75,err}/<name>.{current,expected,diff}.png` + `report.json`.
 *
 * Scoring is reported, not asserted: the returned report may contain failing
 * tests and that's fine. Callers gate by inspecting the returned report.
 */
export async function runSuite(opts: RunSuiteOptions): Promise<ReftestReport> {
  const overwrite = opts.overwrite ?? true;
  const outputDir = path.resolve(opts.outputDir);

  if (overwrite) {
    rmrf(outputDir);
  } else if (fs.existsSync(outputDir)) {
    throw new Error(
      `Output directory already exists: ${outputDir}. Use --overwrite to clear it.`
    );
  }
  mkdirp(outputDir);

  const pairs = await discoverPairs({
    actualDir: opts.actualDir,
    expectedDir: opts.expectedDir,
    pattern: opts.pattern,
    filter: opts.filter,
  });

  const results: TestResult[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]!;
    const result = await processPair(pair, outputDir, opts);
    results.push(result);
    opts.onProgress?.({
      index: i,
      total: pairs.length,
      name: pair.name,
      bucket: result.error ? "err" : bucketForScore(result.similarityScore),
      similarity: result.similarityScore,
      error: result.error,
    });
  }

  const report = buildReport(
    opts.suiteDir ?? opts.actualDir,
    outputDir,
    results
  );
  writeReportFile(path.join(outputDir, "report.json"), report);
  return report;
}

async function processPair(
  pair: DiscoveredPair,
  outputDir: string,
  opts: RunSuiteOptions
): Promise<TestResult> {
  if (!pair.expectedExists) {
    return routeToErr(pair, outputDir, `no expected image for ${pair.name}`, {
      copyExpected: false,
    });
  }

  const tempDiff = path.join(outputDir, `${pair.name}.temp.diff.png`);
  let comparison;
  try {
    comparison = await compareFiles(pair.actualPath, pair.expectedPath, {
      threshold: opts.threshold,
      aa: opts.aa,
      bg: opts.bg,
      mask: opts.mask,
      diffOutputPath: tempDiff,
    });
  } catch (e) {
    return routeToErr(
      pair,
      outputDir,
      `Comparison failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (comparison.error) {
    fs.rmSync(tempDiff, { force: true });
    return routeToErr(pair, outputDir, comparison.error, {
      similarityScore: comparison.similarity,
      diffPercentage: comparison.diffPercentage,
    });
  }

  const bucket = bucketForScore(comparison.similarity);
  const bucketDir = path.join(outputDir, bucket);
  mkdirp(bucketDir);
  const finalCurrent = path.join(bucketDir, `${pair.name}.current.png`);
  const finalExpected = path.join(bucketDir, `${pair.name}.expected.png`);
  const finalDiff = path.join(bucketDir, `${pair.name}.diff.png`);

  fs.copyFileSync(pair.actualPath, finalCurrent);
  fs.copyFileSync(pair.expectedPath, finalExpected);
  let diffPng: string | null = null;
  try {
    fs.renameSync(tempDiff, finalDiff);
    diffPng = finalDiff;
  } catch {
    // No diff image was produced (identical pair, or compare skipped output).
  }

  return {
    testName: pair.name,
    similarityScore: comparison.similarity,
    diffPercentage: comparison.diffPercentage,
    outputPng: finalCurrent,
    diffPng,
    error: null,
  };
}

function routeToErr(
  pair: DiscoveredPair,
  outputDir: string,
  error: string,
  overrides: {
    copyExpected?: boolean;
    similarityScore?: number;
    diffPercentage?: number;
  } = {}
): TestResult {
  const {
    copyExpected = true,
    similarityScore = 0,
    diffPercentage = 100,
  } = overrides;
  const errDir = path.join(outputDir, "err");
  mkdirp(errDir);
  const finalCurrent = path.join(errDir, `${pair.name}.current.png`);
  try {
    fs.copyFileSync(pair.actualPath, finalCurrent);
  } catch {
    // Produce the row even if the actual PNG is unreadable.
  }
  if (copyExpected && pair.expectedExists) {
    const finalExpected = path.join(errDir, `${pair.name}.expected.png`);
    try {
      fs.copyFileSync(pair.expectedPath, finalExpected);
    } catch {
      // Non-fatal.
    }
  }
  return {
    testName: pair.name,
    similarityScore,
    diffPercentage,
    outputPng: finalCurrent,
    diffPng: null,
    error,
  };
}
