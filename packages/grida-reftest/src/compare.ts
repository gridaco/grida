import * as fs from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { compositeRgbaOverBg } from "./composite.js";
import { clampPercentage, clampSimilarity } from "./score.js";
import type {
  BgColor,
  CompareOptions,
  CompareResult,
  ScoringMask,
} from "./types.js";

const DEFAULT_THRESHOLD = 0.1;
const DEFAULT_AA = false;
const DEFAULT_BG: BgColor = "white";
const DEFAULT_MASK: ScoringMask = "alpha";

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA8 pixel buffer (length = width * height * 4). */
  data: Buffer;
}

/**
 * Compare two PNG files on disk and return similarity/diff metrics.
 *
 * Mirrors the scoring formula in `crates/grida-dev/src/reftest/compare.rs`:
 *
 *   scoring_pixels = mask === "alpha"
 *     ? count(actual.a > 0 OR expected.a > 0)
 *     : width * height
 *   similarity_score = 1 - min(diff_pixels / scoring_pixels, 1.0)
 *   diff_percentage  = (diff_pixels / scoring_pixels) * 100
 *
 * Dimension mismatch is a non-throw failure: returns score 0.0, error set.
 * Exactly-zero scoring_pixels (e.g. fully transparent oracle with alpha
 * mask) is treated as a perfect match to match Rust.
 */
export async function compareFiles(
  actualPath: string,
  expectedPath: string,
  opts: CompareOptions = {}
): Promise<CompareResult> {
  const [actualPng, expectedPng] = await Promise.all([
    loadPng(actualPath),
    loadPng(expectedPath),
  ]);
  return compareBuffers(actualPng, expectedPng, opts);
}

/** Same as compareFiles but starting from already-decoded PNGs. */
export function compareBuffers(
  actualPng: DecodedPng,
  expectedPng: DecodedPng,
  opts: CompareOptions = {}
): CompareResult {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const aa = opts.aa ?? DEFAULT_AA;
  const bg = opts.bg ?? DEFAULT_BG;
  const mask = opts.mask ?? DEFAULT_MASK;

  const { width, height } = actualPng;

  if (expectedPng.width !== width || expectedPng.height !== height) {
    return {
      similarity: 0,
      diffPercentage: 100,
      diffPixels: width * height,
      totalPixels: width * height,
      width,
      height,
      error: `Dimension mismatch: actual ${width}x${height} vs expected ${expectedPng.width}x${expectedPng.height}`,
    };
  }

  const scoringPixels =
    mask === "alpha"
      ? countVisiblePixels(actualPng.data, expectedPng.data)
      : width * height;

  // Composite both sides onto the bg before diffing (matches Rust).
  const actualOpaque = compositeRgbaOverBg(actualPng.data, width, height, bg);
  const expectedOpaque = compositeRgbaOverBg(
    expectedPng.data,
    width,
    height,
    bg
  );

  const diffOutput = opts.diffOutputPath
    ? Buffer.alloc(width * height * 4)
    : null;

  const diffPixels = pixelmatch(
    actualOpaque,
    expectedOpaque,
    diffOutput,
    width,
    height,
    { threshold, includeAA: !aa }
  );

  if (diffOutput && opts.diffOutputPath) {
    const diffPng = new PNG({ width, height });
    diffOutput.copy(diffPng.data);
    fs.writeFileSync(opts.diffOutputPath, PNG.sync.write(diffPng));
  }

  if (scoringPixels <= 0) {
    // Matches Rust: no visible pixels ⇒ perfect match.
    return {
      similarity: 1,
      diffPercentage: 0,
      diffPixels,
      totalPixels: 0,
      width,
      height,
      error: null,
    };
  }

  const diffRatio = diffPixels / scoringPixels;
  return {
    similarity: clampSimilarity(1 - Math.min(diffRatio, 1)),
    diffPercentage: clampPercentage(diffRatio * 100),
    diffPixels,
    totalPixels: scoringPixels,
    width,
    height,
    error: null,
  };
}

function countVisiblePixels(actual: Buffer, expected: Buffer): number {
  let visible = 0;
  for (let i = 3; i < actual.length; i += 4) {
    if (actual[i]! > 0 || expected[i]! > 0) visible++;
  }
  return visible;
}

/**
 * Load and decode a PNG file as RGBA8. Sync decode (`PNG.sync.read`) is
 * faster than streaming for the small-PNG workload the reftest runner
 * hits — event-loop hops dominate pure CPU for test-suite images.
 */
export async function loadPng(path: string): Promise<DecodedPng> {
  const buf = await fs.promises.readFile(path);
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}
