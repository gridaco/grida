use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::reftest::oracles::{OracleFlags, OracleStatus};

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct TestResult {
    pub test_name: String,
    /// Effective similarity score used for bucketing. When a Chrome
    /// baseline PNG is available, this is `max(vs_expected,
    /// vs_chrome)` — i.e. the fixture passes if our output matches
    /// either oracle. Otherwise equal to `vs_expected`.
    pub similarity_score: f64,
    pub diff_percentage: f64,
    pub output_png: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff_png: Option<String>,
    /// Score against `expected.png` (the resvg-test-suite author's
    /// oracle). Always present unless the render itself errored.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vs_expected: Option<f64>,
    /// Score against the baked Chrome PNG, when one is available.
    /// `None` if no chrome baseline is configured or the file is
    /// missing for this fixture.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vs_chrome: Option<f64>,
    /// Path to the baked Chrome PNG copied next to current/expected
    /// in the result dir. Mirrors `output_png` / `diff_png`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chrome_png: Option<String>,
    /// Per-renderer status row from upstream `results.csv`. `None`
    /// when no oracle index is loaded or no row matches.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oracle_flags: Option<OracleFlags>,
    /// Coarse classification derived from `oracle_flags`. `None` when
    /// no oracle data is available for this fixture.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oracle_status: Option<OracleStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Per-bucket aggregate (consensus / disputed / ub).
///
/// `passing` counts tests where `similarity_score >= pass_floor`.
/// Only meaningful for the consensus bucket — that's the headline
/// parity number. For disputed and ub buckets it's still computed but
/// less load-bearing.
#[derive(Serialize, Deserialize, Debug, Default)]
pub(crate) struct OracleBucketStats {
    pub total: usize,
    pub avg_similarity: f64,
    pub passing: usize,
    /// Average score against `expected.png` only — useful for the
    /// disputed bucket where it tells you "how often our render
    /// happens to land on the resvg author's interpretation."
    pub avg_vs_expected: f64,
    /// Average score against the baked Chrome PNG, when present.
    /// Only meaningful when chrome baseline data is loaded.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_vs_chrome: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub(crate) struct OracleBuckets {
    pub consensus: OracleBucketStats,
    pub disputed: OracleBucketStats,
    pub ub: OracleBucketStats,
    pub unknown: OracleBucketStats,
    /// Floor used to compute the `passing` field in each bucket.
    /// Read from `[test.scoring].pass_floor`, defaulting to 0.95.
    pub pass_floor: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub(crate) struct ReftestReport {
    pub total: usize,
    pub average_similarity: f64,
    pub min_similarity: f64,
    pub max_similarity: f64,
    /// Aggregate parity numbers split by oracle status. The headline
    /// figure is `oracle_buckets.consensus.passing /
    /// oracle_buckets.consensus.total`.
    pub oracle_buckets: OracleBuckets,
    pub tests: Vec<TestResult>,
    pub timestamp: String,
    pub suite_dir: String,
    pub output_dir: String,
}

impl ReftestReport {
    pub(crate) fn new(
        suite_dir: &Path,
        output_dir: &Path,
        tests: Vec<TestResult>,
        pass_floor: f64,
    ) -> Self {
        let total = tests.len();

        let similarities: Vec<f64> = tests
            .iter()
            .filter_map(|t| {
                if t.error.is_none() {
                    Some(t.similarity_score)
                } else {
                    None
                }
            })
            .collect();

        let average_similarity = if similarities.is_empty() {
            0.0
        } else {
            similarities.iter().sum::<f64>() / similarities.len() as f64
        };

        let min_similarity = similarities
            .iter()
            .copied()
            .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or(0.0);

        let max_similarity = similarities
            .iter()
            .copied()
            .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or(0.0);

        let oracle_buckets = compute_buckets(&tests, pass_floor);

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();

        Self {
            total,
            average_similarity,
            min_similarity,
            max_similarity,
            oracle_buckets,
            tests,
            timestamp,
            suite_dir: suite_dir.to_string_lossy().to_string(),
            output_dir: output_dir.to_string_lossy().to_string(),
        }
    }
}

/// Aggregate per-bucket stats from a flat list of test results.
///
/// A test contributes to exactly one bucket (consensus / disputed /
/// ub / unknown). Tests with a render or compare error are excluded
/// from `avg_similarity` / `passing` — they count toward `total` but
/// don't pollute averages with their forced-zero scores.
fn compute_buckets(tests: &[TestResult], pass_floor: f64) -> OracleBuckets {
    let mut consensus = BucketAccum::default();
    let mut disputed = BucketAccum::default();
    let mut ub = BucketAccum::default();
    let mut unknown = BucketAccum::default();
    for t in tests {
        let bucket = match t.oracle_status {
            Some(OracleStatus::Consensus) => &mut consensus,
            Some(OracleStatus::Disputed) => &mut disputed,
            Some(OracleStatus::Ub) => &mut ub,
            Some(OracleStatus::Unknown) | None => &mut unknown,
        };
        bucket.push(t, pass_floor);
    }
    OracleBuckets {
        consensus: consensus.finalize(),
        disputed: disputed.finalize(),
        ub: ub.finalize(),
        unknown: unknown.finalize(),
        pass_floor,
    }
}

#[derive(Default)]
struct BucketAccum {
    total: usize,
    sum_similarity: f64,
    sum_vs_expected: f64,
    sum_vs_chrome: f64,
    n_with_chrome: usize,
    n_no_error: usize,
    passing: usize,
}

impl BucketAccum {
    fn push(&mut self, t: &TestResult, pass_floor: f64) {
        self.total += 1;
        if t.error.is_some() {
            return;
        }
        self.n_no_error += 1;
        self.sum_similarity += t.similarity_score;
        if let Some(v) = t.vs_expected {
            self.sum_vs_expected += v;
        }
        if let Some(v) = t.vs_chrome {
            self.sum_vs_chrome += v;
            self.n_with_chrome += 1;
        }
        if t.similarity_score >= pass_floor {
            self.passing += 1;
        }
    }

    fn finalize(self) -> OracleBucketStats {
        let denom = self.n_no_error.max(1) as f64;
        OracleBucketStats {
            total: self.total,
            avg_similarity: if self.n_no_error == 0 {
                0.0
            } else {
                self.sum_similarity / denom
            },
            passing: self.passing,
            avg_vs_expected: if self.n_no_error == 0 {
                0.0
            } else {
                self.sum_vs_expected / denom
            },
            avg_vs_chrome: if self.n_with_chrome == 0 {
                None
            } else {
                Some(self.sum_vs_chrome / self.n_with_chrome as f64)
            },
        }
    }
}

pub(crate) fn generate_json_report(report: &ReftestReport, output_path: &Path) -> Result<()> {
    // Ensure output directory exists
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create output directory {}", parent.display()))?;
    }

    let json =
        serde_json::to_string_pretty(report).context("failed to serialize report to JSON")?;

    std::fs::write(output_path, json)
        .with_context(|| format!("failed to write report to {}", output_path.display()))?;

    Ok(())
}
