import type { Bucket } from "./types.js";

/**
 * Map a similarity score in [0, 1] to a bucket directory name.
 *
 * Mirrors `crates/grida-dev/src/reftest/runner.rs::get_score_category`
 * exactly (percentage * 100, ≥99/95/90 → S99/S95/S90, else S75). Errors
 * are routed to the `err` bucket by the runner, not by this function.
 */
export function bucketForScore(score: number): Exclude<Bucket, "err"> {
  const pct = score * 100;
  if (pct >= 99) return "S99";
  if (pct >= 95) return "S95";
  if (pct >= 90) return "S90";
  return "S75";
}

/** Clamp a similarity score to [0, 1]. */
export function clampSimilarity(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Clamp a diff percentage to [0, 100]. */
export function clampPercentage(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}
