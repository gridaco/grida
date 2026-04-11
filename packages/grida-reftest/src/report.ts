import { writeJsonFile } from "./fs-utils.js";
import type { ReftestReport, TestResult } from "./types.js";

/**
 * Construct a ReftestReport from a list of test results.
 *
 * Mirrors `crates/grida-dev/src/reftest/report.rs::ReftestReport::new`:
 * similarity stats are computed over non-error rows only; empty sets
 * degrade to 0.0 averages.
 */
export function buildReport(
  suiteDir: string,
  outputDir: string,
  tests: TestResult[],
  now: Date = new Date()
): ReftestReport {
  const valid = tests
    .filter((t) => t.error === null)
    .map((t) => t.similarityScore);
  const averageSimilarity = valid.length
    ? valid.reduce((a, b) => a + b, 0) / valid.length
    : 0;
  const minSimilarity = valid.length ? Math.min(...valid) : 0;
  const maxSimilarity = valid.length ? Math.max(...valid) : 0;
  const timestamp = Math.floor(now.getTime() / 1000).toString();

  return {
    total: tests.length,
    averageSimilarity,
    minSimilarity,
    maxSimilarity,
    tests,
    timestamp,
    suiteDir,
    outputDir,
  };
}

/** Serializable snake_case form of the report (matches Rust JSON output). */
interface SerializedReport {
  total: number;
  average_similarity: number;
  min_similarity: number;
  max_similarity: number;
  tests: SerializedTestResult[];
  timestamp: string;
  suite_dir: string;
  output_dir: string;
}

interface SerializedTestResult {
  test_name: string;
  similarity_score: number;
  diff_percentage: number;
  output_png: string;
  diff_png?: string;
  error?: string;
}

/**
 * Convert a camelCase report to its snake_case wire form.
 *
 * `diff_png` and `error` are omitted when null (matches Rust's
 * `#[serde(skip_serializing_if = "Option::is_none")]`).
 */
export function serializeReport(report: ReftestReport): SerializedReport {
  return {
    total: report.total,
    average_similarity: report.averageSimilarity,
    min_similarity: report.minSimilarity,
    max_similarity: report.maxSimilarity,
    tests: report.tests.map(serializeTest),
    timestamp: report.timestamp,
    suite_dir: report.suiteDir,
    output_dir: report.outputDir,
  };
}

function serializeTest(t: TestResult): SerializedTestResult {
  const out: SerializedTestResult = {
    test_name: t.testName,
    similarity_score: t.similarityScore,
    diff_percentage: t.diffPercentage,
    output_png: t.outputPng,
  };
  if (t.diffPng !== null) out.diff_png = t.diffPng;
  if (t.error !== null) out.error = t.error;
  return out;
}

/** Parse a JSON string (snake_case) back into the camelCase report shape. */
export function deserializeReport(json: string): ReftestReport {
  const raw = JSON.parse(json) as SerializedReport;
  return {
    total: raw.total,
    averageSimilarity: raw.average_similarity,
    minSimilarity: raw.min_similarity,
    maxSimilarity: raw.max_similarity,
    tests: raw.tests.map((t) => ({
      testName: t.test_name,
      similarityScore: t.similarity_score,
      diffPercentage: t.diff_percentage,
      outputPng: t.output_png,
      diffPng: t.diff_png ?? null,
      error: t.error ?? null,
    })),
    timestamp: raw.timestamp,
    suiteDir: raw.suite_dir,
    outputDir: raw.output_dir,
  };
}

/** Write a ReftestReport to disk as JSON (pretty, snake_case). */
export function writeReportFile(filePath: string, report: ReftestReport): void {
  writeJsonFile(filePath, serializeReport(report));
}

/** Multi-line console summary string. Mirrors Rust runner output. */
export function summarizeReport(
  report: ReftestReport,
  reportPath: string
): string {
  return [
    `Report generated: ${reportPath}`,
    `Total tests: ${report.total}`,
    `Average similarity: ${(report.averageSimilarity * 100).toFixed(2)}%`,
    `Min similarity: ${(report.minSimilarity * 100).toFixed(2)}%`,
    `Max similarity: ${(report.maxSimilarity * 100).toFixed(2)}%`,
  ].join("\n");
}
