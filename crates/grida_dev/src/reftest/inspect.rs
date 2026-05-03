//! `reftest inspect <fixture>` — print everything we know about
//! one fixture in one shot.
//!
//! Designed so an agent (or human) can answer common questions
//! without ad-hoc `jq` invocations:
//!  - what is the suite-relative path?
//!  - what does the upstream `results.csv` say about each renderer?
//!  - is this fixture consensus / disputed / UB?
//!  - did our last run produce a score? against expected? against chrome?
//!  - where are the four PNGs (current / expected / chrome / diff)?
//!
//! Accepts the fixture in two forms — either the test-name form
//! (`filters_feSpecularLighting_specularExponent=0`) used by
//! `report.json` and result-dir filenames, or the suite-relative
//! path form (`filters/feSpecularLighting/specularExponent=0.svg`).
//! We try the path form first since it disambiguates underscores in
//! filenames vs. directory boundaries; if the SVG isn't on disk we
//! fall back to scanning the suite for a name match.

use anyhow::{bail, Context, Result};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

use crate::reftest::args::InspectArgs;
use crate::reftest::oracles::{rel_key, OracleFlags, OracleIndex, OracleStatus};
use crate::reftest::render::name_from_rel_path;

#[derive(Serialize)]
struct Inspection {
    fixture: String,
    rel_svg_path: String,
    test_name: String,
    svg_path: PathBuf,
    expected_png_path: PathBuf,
    chrome_baseline_png_path: Option<PathBuf>,
    oracle_status: Option<OracleStatus>,
    oracle_flags: Option<OracleFlags>,
    /// The corresponding entry from the latest `report.json`, if
    /// the result dir has one and it includes this fixture. Passed
    /// through verbatim so callers can read whatever the runner wrote.
    last_run: Option<Value>,
    /// Resolved paths to the per-bucket result tiles, when present.
    result_tiles: Option<ResultTiles>,
}

#[derive(Serialize, Default)]
struct ResultTiles {
    bucket: String,
    current: Option<PathBuf>,
    expected: Option<PathBuf>,
    chrome: Option<PathBuf>,
    diff: Option<PathBuf>,
}

pub(crate) fn run(args: InspectArgs) -> Result<()> {
    let suite_dir = args
        .suite_dir
        .canonicalize()
        .with_context(|| format!("failed to canonicalize {}", args.suite_dir.display()))?;
    let tests_root = suite_dir.join("tests");
    if !tests_root.is_dir() {
        bail!(
            "suite tests dir not found: {} — pass --suite-dir",
            tests_root.display()
        );
    }

    let (rel_svg, svg_path) = resolve_fixture(&tests_root, &args.fixture)?;
    let rel_key_str = rel_key(&rel_svg);
    let test_name = name_from_rel_path(&rel_svg);
    let expected_png = svg_path.with_extension("png");

    let oracles = OracleIndex::load_from_dir(&suite_dir);
    let oracle_flags = oracles.lookup(&rel_key_str);
    let oracle_status = oracle_flags.map(|f| f.classify());
    let chrome_png = oracles.chrome_png_for(&rel_key_str);

    // Pull last-run data, if present.
    let report_path = args.result_dir.join("report.json");
    let (last_run, result_tiles) = load_last_run(&report_path, &args.result_dir, &test_name);

    let report = Inspection {
        fixture: args.fixture.clone(),
        rel_svg_path: rel_key_str,
        test_name,
        svg_path,
        expected_png_path: expected_png,
        chrome_baseline_png_path: chrome_png,
        oracle_status,
        oracle_flags,
        last_run,
        result_tiles,
    };

    if args.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_human(&report);
    }
    Ok(())
}

/// Try the suite-relative path first, then fall back to scanning
/// for a test-name match.
fn resolve_fixture(tests_root: &Path, fixture: &str) -> Result<(PathBuf, PathBuf)> {
    // Form 1: suite-relative path (with or without `.svg`).
    let p = if fixture.ends_with(".svg") {
        tests_root.join(fixture)
    } else {
        tests_root.join(format!("{fixture}.svg"))
    };
    if p.is_file() {
        let rel = p.strip_prefix(tests_root).unwrap().to_path_buf();
        return Ok((rel, p));
    }

    // Form 2: test-name (`cat_group_name`). Convert underscores back
    // to slashes greedily — many filenames legitimately contain
    // underscores, so we try the longest prefix-as-dirs decoding.
    if let Some((rel, abs)) = scan_for_test_name(tests_root, fixture) {
        return Ok((rel, abs));
    }

    bail!(
        "fixture not found: {fixture}\n  tried path: {}\n  also scanned by test-name match",
        p.display()
    );
}

fn scan_for_test_name(tests_root: &Path, name: &str) -> Option<(PathBuf, PathBuf)> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(&p, out);
            } else if p.extension().and_then(|s| s.to_str()) == Some("svg") {
                out.push(p);
            }
        }
    }
    let mut all = Vec::new();
    walk(tests_root, &mut all);
    for abs in all {
        let Ok(rel) = abs.strip_prefix(tests_root) else {
            continue;
        };
        if name_from_rel_path(rel) == name {
            return Some((rel.to_path_buf(), abs.clone()));
        }
    }
    None
}

fn load_last_run(
    report_path: &Path,
    result_dir: &Path,
    test_name: &str,
) -> (Option<Value>, Option<ResultTiles>) {
    if !report_path.is_file() {
        return (None, None);
    }
    let body = match fs::read_to_string(report_path) {
        Ok(s) => s,
        Err(_) => return (None, None),
    };
    let json: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => return (None, None),
    };
    let Some(tests) = json.get("tests").and_then(|v| v.as_array()) else {
        return (None, None);
    };
    let entry = tests
        .iter()
        .find(|t| t.get("test_name").and_then(|n| n.as_str()) == Some(test_name))
        .cloned();
    let tiles = entry.as_ref().map(|e| {
        let bucket = bucket_for(e);
        let dir = result_dir.join(&bucket);
        let pick = |suffix: &str| {
            let p = dir.join(format!("{test_name}{suffix}"));
            p.is_file().then_some(p)
        };
        ResultTiles {
            bucket,
            current: pick(".current.png"),
            expected: pick(".expected.png"),
            chrome: pick(".chrome.png"),
            diff: pick(".diff.png"),
        }
    });
    (entry, tiles)
}

/// Re-derive the bucket name from a test's similarity_score, since
/// the runner doesn't store it explicitly. Mirrors `get_score_category`.
fn bucket_for(entry: &Value) -> String {
    if entry.get("error").and_then(|v| v.as_str()).is_some() {
        return "err".into();
    }
    let s = entry
        .get("similarity_score")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let pct = s * 100.0;
    if pct >= 99.0 {
        "S99".into()
    } else if pct >= 95.0 {
        "S95".into()
    } else if pct >= 90.0 {
        "S90".into()
    } else {
        "S75".into()
    }
}

fn print_human(r: &Inspection) {
    println!("fixture       : {}", r.fixture);
    println!("rel path      : {}", r.rel_svg_path);
    println!("test name     : {}", r.test_name);
    println!("svg           : {}", r.svg_path.display());
    println!("expected.png  : {}", r.expected_png_path.display());
    if let Some(p) = &r.chrome_baseline_png_path {
        println!("chrome.png    : {}", p.display());
    } else {
        println!("chrome.png    : (not baked — run `reftest bake`)");
    }
    println!();
    if let (Some(status), Some(flags)) = (r.oracle_status, r.oracle_flags) {
        println!("oracle status : {}", oracle_label(status));
        println!("renderer flags:");
        let row = |label: &str, v: crate::reftest::oracles::RendererStatus| {
            println!("  {label:<10}{v:?}");
        };
        row("chrome", flags.chrome);
        row("firefox", flags.firefox);
        row("safari", flags.safari);
        row("resvg", flags.resvg);
        row("batik", flags.batik);
        row("inkscape", flags.inkscape);
        row("librsvg", flags.librsvg);
        row("svgnet", flags.svgnet);
        row("qtsvg", flags.qtsvg);
    } else {
        println!("oracle status : (no `[test.oracles].results_csv` configured)");
    }
    println!();
    if let Some(last) = &r.last_run {
        println!("last run:");
        let s = |k: &str| {
            last.get(k)
                .and_then(|v| v.as_f64())
                .map(|f| format!("{f:.4}"))
        };
        println!(
            "  similarity (effective) : {}",
            s("similarity_score").as_deref().unwrap_or("?")
        );
        println!(
            "  vs_expected            : {}",
            s("vs_expected").as_deref().unwrap_or("(none)")
        );
        println!(
            "  vs_chrome              : {}",
            s("vs_chrome").as_deref().unwrap_or("(none)")
        );
        if let Some(err) = last.get("error").and_then(|v| v.as_str()) {
            println!("  error                  : {err}");
        }
        if let Some(tiles) = &r.result_tiles {
            println!("  bucket                 : {}", tiles.bucket);
            for (label, opt) in [
                ("current.png", &tiles.current),
                ("expected.png", &tiles.expected),
                ("chrome.png", &tiles.chrome),
                ("diff.png", &tiles.diff),
            ] {
                if let Some(p) = opt {
                    println!("  {label:<23}: {}", p.display());
                }
            }
        }
    } else {
        println!("last run      : (no report.json — run `reftest run` first)");
    }
}

fn oracle_label(s: OracleStatus) -> &'static str {
    match s {
        OracleStatus::Consensus => "consensus  (chrome agrees with expected.png)",
        OracleStatus::Disputed => "disputed   (chrome diverges; chrome.png is 2nd oracle)",
        OracleStatus::Ub => "ub         (UNKNOWN — excluded from headline parity)",
        OracleStatus::Unknown => "unknown    (no row in results.csv)",
    }
}
