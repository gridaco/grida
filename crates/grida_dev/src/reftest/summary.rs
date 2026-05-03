//! `reftest summary` — print headline parity numbers from a
//! `report.json`.
//!
//! Two output modes:
//!  - **text** (default): dense, scannable status lines.
//!  - **`--json`**: stable schema agents/CI can parse without
//!    grepping a moving text format.
//!
//! The headline is `consensus.passing / consensus.total` — the
//! fraction of well-defined Chrome-consensus fixtures we clear at
//! `pass_floor`. UB and disputed counts are reported alongside but
//! not folded into the headline.

use anyhow::{bail, Context, Result};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::reftest::args::SummaryArgs;
use crate::reftest::oracles::OracleStatus;
use crate::reftest::report::{OracleBucketStats, ReftestReport, TestResult};

#[derive(Serialize)]
struct SummaryOut<'a> {
    report: PathBuf,
    total: usize,
    average_similarity: f64,
    pass_floor: f64,
    headline: HeadlineOut,
    consensus: &'a OracleBucketStats,
    disputed: &'a OracleBucketStats,
    ub: &'a OracleBucketStats,
    unknown: &'a OracleBucketStats,
    /// Top N worst-scoring tests in the consensus bucket — the
    /// real-bug shortlist. Disputed and UB excluded.
    worst_consensus: Vec<TestRow>,
}

#[derive(Serialize)]
struct HeadlineOut {
    consensus_pass_rate: f64,
    consensus_passing: usize,
    consensus_total: usize,
}

#[derive(Serialize)]
struct TestRow {
    test_name: String,
    similarity: f64,
    vs_expected: Option<f64>,
    vs_chrome: Option<f64>,
}

const WORST_TOP_N: usize = 10;

pub(crate) fn run(args: SummaryArgs) -> Result<()> {
    if !args.report.is_file() {
        bail!(
            "report not found: {} — run `reftest run` first",
            args.report.display()
        );
    }
    let body = fs::read_to_string(&args.report)
        .with_context(|| format!("failed to read {}", args.report.display()))?;
    let report: ReftestReport = serde_json::from_str(&body)
        .with_context(|| format!("failed to parse JSON in {}", args.report.display()))?;

    let buckets = &report.oracle_buckets;
    let consensus_pass_rate = if buckets.consensus.total > 0 {
        buckets.consensus.passing as f64 / buckets.consensus.total as f64
    } else {
        0.0
    };
    let worst = collect_worst(&report.tests, OracleStatus::Consensus, buckets.pass_floor);

    let out = SummaryOut {
        report: args.report.clone(),
        total: report.total,
        average_similarity: report.average_similarity,
        pass_floor: buckets.pass_floor,
        headline: HeadlineOut {
            consensus_pass_rate,
            consensus_passing: buckets.consensus.passing,
            consensus_total: buckets.consensus.total,
        },
        consensus: &buckets.consensus,
        disputed: &buckets.disputed,
        ub: &buckets.ub,
        unknown: &buckets.unknown,
        worst_consensus: worst,
    };

    if args.json {
        println!("{}", serde_json::to_string_pretty(&out)?);
    } else {
        print_human(&out, &args.report);
    }
    Ok(())
}

/// Collect the worst-scoring tests in a given bucket that fell below
/// the pass floor. Useful as a "what to fix next" list.
fn collect_worst(tests: &[TestResult], status: OracleStatus, pass_floor: f64) -> Vec<TestRow> {
    let mut rows: Vec<TestRow> = tests
        .iter()
        .filter(|t| {
            t.oracle_status == Some(status) && t.error.is_none() && t.similarity_score < pass_floor
        })
        .map(|t| TestRow {
            test_name: t.test_name.clone(),
            similarity: t.similarity_score,
            vs_expected: t.vs_expected,
            vs_chrome: t.vs_chrome,
        })
        .collect();
    rows.sort_by(|a, b| {
        a.similarity
            .partial_cmp(&b.similarity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    rows.truncate(WORST_TOP_N);
    rows
}

fn print_human(s: &SummaryOut, report_path: &Path) {
    println!("report          : {}", report_path.display());
    println!(
        "total           : {}    avg similarity {:.2}%    pass_floor {:.2}",
        s.total,
        s.average_similarity * 100.0,
        s.pass_floor
    );
    println!();
    println!(
        "headline        : consensus pass-rate {:.2}%  ({}/{})",
        s.headline.consensus_pass_rate * 100.0,
        s.headline.consensus_passing,
        s.headline.consensus_total
    );
    println!();
    println!("buckets:");
    print_bucket("consensus ", s.consensus, true);
    print_bucket("disputed  ", s.disputed, false);
    print_bucket("ub        ", s.ub, false);
    if s.unknown.total > 0 {
        print_bucket("unknown   ", s.unknown, false);
    }
    if !s.worst_consensus.is_empty() {
        println!();
        println!(
            "worst consensus failures (≤ {:.2}, top {}):",
            s.pass_floor,
            s.worst_consensus.len()
        );
        for t in &s.worst_consensus {
            let chr = t
                .vs_chrome
                .map(|v| format!("  vs_chrome={v:.3}"))
                .unwrap_or_default();
            println!("  {:.3}  {}{}", t.similarity, t.test_name, chr);
        }
    }
}

fn print_bucket(label: &str, b: &OracleBucketStats, with_passing: bool) {
    let mut line = format!(
        "  {label} n={:<5} avg={:.3}  vs_expected={:.3}",
        b.total, b.avg_similarity, b.avg_vs_expected
    );
    if let Some(c) = b.avg_vs_chrome {
        line.push_str(&format!("  vs_chrome={c:.3}"));
    }
    if with_passing {
        let rate = if b.total > 0 {
            b.passing as f64 / b.total as f64 * 100.0
        } else {
            0.0
        };
        line.push_str(&format!("  passing={} ({:.2}%)", b.passing, rate));
    }
    println!("{line}");
}
