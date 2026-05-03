use crate::reftest::args::{BgColor, RunArgs, SvgRenderer};
use crate::reftest::compare::{compare_images, ComparisonResult, ScoringMask};
use crate::reftest::config::ReftestToml;
use crate::reftest::oracles::{rel_key, OracleFlags, OracleIndex, OracleStatus};
use crate::reftest::render::{
    find_test_pairs_from_glob, find_test_pairs_in_dirs, render_svg_to_png,
    render_svg_to_png_via_htmlcss, TestPair,
};
use crate::reftest::report::{generate_json_report, ReftestReport, TestResult};
use anyhow::{Context, Result};
use indicatif::{ProgressBar, ProgressStyle};
use std::panic;
use std::path::{Path, PathBuf};

/// Default similarity floor for the "passing" count in oracle
/// buckets when `[test.scoring].pass_floor` is unset.
const DEFAULT_PASS_FLOOR: f64 = 0.95;

fn repo_target_reftests_dir() -> PathBuf {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .and_then(|p| p.parent())
        .unwrap_or(manifest_dir)
        .join("target")
        .join("reftests")
}

fn sanitize_dir_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' => c,
            _ => '_',
        })
        .collect::<String>()
}

fn get_score_category(score: f64) -> &'static str {
    let pct = score * 100.0;
    if pct >= 99.0 {
        "S99"
    } else if pct >= 95.0 {
        "S95"
    } else if pct >= 90.0 {
        "S90"
    } else {
        "S75"
    }
}

/// Bundle of compare settings threaded through the per-test loop.
/// Avoids passing seven parameters around when we add a second
/// oracle (Chrome baseline).
#[derive(Clone, Copy)]
struct CompareSettings {
    threshold: f32,
    detect_aa: bool,
    bg: BgColor,
    mask: ScoringMask,
}

/// Result of evaluating a rendered output against the available
/// oracles (always `expected.png`; optionally a baked Chrome PNG).
struct DualScore {
    vs_expected: ComparisonResult,
    vs_chrome: Option<ComparisonResult>,
    /// Path to the diff image we want to keep — generated against
    /// whichever oracle the *effective* score was taken from. Lets the
    /// dashboard show the diff against the oracle the test was scored
    /// on, not always against expected.
    diff_against: DiffAgainst,
}

#[derive(Clone, Copy)]
enum DiffAgainst {
    Expected,
    Chrome,
}

pub(crate) async fn run_reftest(args: &RunArgs) -> Result<()> {
    // Load optional config from suite-dir/reftest.toml
    let cfg = ReftestToml::load_from_dir(&args.suite_dir).unwrap_or(None);

    // Compute base output directory
    let mut output_dir = args
        .output_dir
        .as_ref()
        .cloned()
        .unwrap_or_else(repo_target_reftests_dir);

    // If no explicit output-dir was provided, append suite name-based folder
    if args.output_dir.is_none() {
        let suite_name = cfg.as_ref().and_then(|c| c.resolve_name()).or_else(|| {
            args.suite_dir
                .file_name()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        });
        if let Some(name) = suite_name {
            // Keep iosvg (legacy default) at the historical path so
            // existing CI / bookmarks don't break; qualify alt backends
            // with their label.
            let suffix = match args.renderer {
                SvgRenderer::Iosvg => String::new(),
                SvgRenderer::Htmlcss => ".htmlcss".to_string(),
            };
            output_dir = output_dir.join(format!("{}{}", sanitize_dir_name(&name), suffix));
        }
    }

    // Resolve locators
    let mut svg_dir = args.suite_dir.join("svg");
    let mut expects_dir = args.suite_dir.join("png");
    let mut inputs_pattern: Option<String> = None;
    if let Some(conf) = &cfg {
        if let Some(p) = conf.resolve_inputs(&args.suite_dir) {
            svg_dir = p;
        }
        if let Some(p) = conf.resolve_expects(&args.suite_dir) {
            expects_dir = p;
        }
        if let Some(pat) = conf.input_pattern() {
            inputs_pattern = Some(pat.to_string());
        }
    }

    // Effective diff settings (CLI takes precedence when set)
    let cfg_diff = cfg.as_ref().and_then(|c| c.resolve_diff());
    let threshold = if args.threshold != 0.0 {
        args.threshold
    } else {
        cfg_diff.and_then(|d| d.threshold).unwrap_or(0.0)
    };
    let detect_aa = if args.detect_anti_aliasing {
        true
    } else {
        cfg_diff.and_then(|d| d.aa).unwrap_or(false)
    };
    let bg = if let Some(cfg_bg) = cfg.as_ref().and_then(|c| c.resolve_bg()) {
        match cfg_bg.as_str() {
            "white" => BgColor::White,
            "black" => BgColor::Black,
            _ => args.bg,
        }
    } else {
        args.bg
    };
    // Effective scoring settings
    let cfg_scoring = cfg.as_ref().and_then(|c| c.resolve_scoring());
    let test_kind = cfg.as_ref().and_then(|c| c.resolve_kind());
    let mask = cfg_scoring
        .as_ref()
        .and_then(|s| s.mask.clone())
        .as_deref()
        .map(|m| match m {
            "alpha" => ScoringMask::Alpha,
            _ => ScoringMask::None,
        })
        .unwrap_or_else(|| {
            // Default to "alpha" for SVG tests when mask is not explicitly set
            if test_kind.as_deref() == Some("svg") {
                ScoringMask::Alpha
            } else {
                ScoringMask::None
            }
        });
    let pass_floor = cfg_scoring
        .as_ref()
        .and_then(|s| s.pass_floor)
        .unwrap_or(DEFAULT_PASS_FLOOR);

    let compare_settings = CompareSettings {
        threshold,
        detect_aa,
        bg,
        mask,
    };

    // Optional — when missing, every test falls into the "unknown"
    // bucket and chrome scores are simply absent.
    let oracles = OracleIndex::load_from_dir(&args.suite_dir);
    if oracles.len() > 0 {
        println!("Loaded {} oracle rows from results.csv", oracles.len());
    }
    if let Some(dir) = oracles.chrome_baseline_dir.as_ref() {
        println!("Chrome baseline: {}", dir.display());
    }

    // Handle existing output directory
    let overwrite = args.overwrite.unwrap_or(true);
    if output_dir.exists() {
        // `reftest view` drops `index.html` / `tests` symlinks here
        // and serves the dir via `python3 -m http.server`. While the
        // server is alive, file operations against the tree race
        // against its active opendir/readdir on macOS — the symptom
        // is sporadic ENOTEMPTY on remove_dir_all up front, or
        // ENOENT on the temp-output rename mid-run, with a confusing
        // "failed to move output PNG" error. Refuse early when the
        // symlinks are present so the user gets one clear message
        // instead of debugging a phantom file system race.
        let view_marker = output_dir.join("index.html");
        let tests_link = output_dir.join("tests");
        let is_symlink = |p: &Path| {
            std::fs::symlink_metadata(p)
                .ok()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
        };
        if is_symlink(&view_marker) || is_symlink(&tests_link) {
            anyhow::bail!(
                "`reftest view` left symlinks at {} — stop the running `reftest view` (Ctrl-C / kill its `python3 -m http.server`) before running `reftest run`, then retry. If view is no longer running, remove {} and {} manually.",
                output_dir.display(),
                view_marker.display(),
                tests_link.display(),
            );
        }

        if overwrite {
            std::fs::remove_dir_all(&output_dir).with_context(|| {
                format!(
                    "failed to remove existing output directory {}",
                    output_dir.display()
                )
            })?;
            println!(
                "Cleared existing output directory: {}",
                output_dir.display()
            );
        } else {
            anyhow::bail!(
                "Output directory already exists: {}. Use --overwrite to clear it, or remove it manually.",
                output_dir.display()
            );
        }
    }

    std::fs::create_dir_all(&output_dir)
        .with_context(|| format!("failed to create output directory {}", output_dir.display()))?;

    // Discover test pairs (glob or directory)
    let mut test_pairs: Vec<TestPair> = if let Some(pat) = inputs_pattern.clone() {
        let disp = args.suite_dir.join(&pat);
        println!(
            "Discovering test pairs from inputs={} expects={}",
            disp.display(),
            expects_dir.display()
        );
        find_test_pairs_from_glob(&args.suite_dir, &pat, &expects_dir)?
    } else {
        println!(
            "Discovering test pairs from inputs={} expects={}",
            svg_dir.display(),
            expects_dir.display()
        );
        find_test_pairs_in_dirs(&svg_dir, &expects_dir)?
    };

    // Apply filter if provided
    if let Some(filter_pattern) = &args.filter {
        let pattern = filter_pattern.trim();
        if pattern.ends_with('*') {
            let prefix = pattern.trim_end_matches('*');
            test_pairs.retain(|pair| pair.test_name.starts_with(prefix));
        } else {
            test_pairs.retain(|pair| pair.test_name.contains(pattern));
        }
    }

    let total = test_pairs.len();
    println!("Found {} test pairs", total);

    let pb = ProgressBar::new(total as u64);
    pb.set_style(
        ProgressStyle::with_template(
            "{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} {msg}",
        )
        .unwrap()
        .progress_chars("=>-"),
    );

    let mut test_results = Vec::new();

    // Process each test sequentially
    for pair in test_pairs.iter() {
        pb.set_message(format!("processing {}", pair.test_name));

        // Resolve oracle row + chrome PNG path for this fixture.
        let oracle_key = pair.rel_svg_path.as_deref().map(rel_key);
        let oracle_flags: Option<OracleFlags> =
            oracle_key.as_deref().and_then(|k| oracles.lookup(k));
        let chrome_baseline_png = oracle_key
            .as_deref()
            .and_then(|k| oracles.chrome_png_for(k));

        // Load reference PNG to get target dimensions for scaling
        let target_size = image::open(&pair.ref_png_path).ok().map(|img| {
            let rgba = img.to_rgba8();
            rgba.dimensions()
        });

        // Render SVG to PNG (temporary location first)
        let temp_output_png = output_dir.join(format!("{}-temp-output.png", pair.test_name));

        // Render SVG to PNG, scaling to match reference size.
        // Wrap in catch_unwind to handle panics from underlying
        // rendering code (usvg for `iosvg`, Skia for `htmlcss`).
        let svg_path_for_panic = pair.svg_path.clone();
        let renderer = args.renderer;
        let render_result = panic::catch_unwind(panic::AssertUnwindSafe(|| match renderer {
            SvgRenderer::Iosvg => render_svg_to_png(&pair.svg_path, &temp_output_png, target_size),
            SvgRenderer::Htmlcss => {
                render_svg_to_png_via_htmlcss(&pair.svg_path, &temp_output_png, target_size)
            }
        }));

        let render_result = match render_result {
            Ok(result) => result,
            Err(panic_payload) => {
                // Convert panic to error message
                let panic_msg = if let Some(s) = panic_payload.downcast_ref::<String>() {
                    s.clone()
                } else if let Some(s) = panic_payload.downcast_ref::<&str>() {
                    s.to_string()
                } else {
                    "Unknown panic occurred during SVG rendering".to_string()
                };
                Err(anyhow::anyhow!(
                    "Panic during SVG rendering ({}): {}",
                    svg_path_for_panic.display(),
                    panic_msg
                ))
            }
        };

        match render_result {
            Ok(_) => {
                let temp_diff_png = output_dir.join(format!("{}-temp-diff.png", pair.test_name));
                let dual = dual_compare(
                    &temp_output_png,
                    &pair.ref_png_path,
                    chrome_baseline_png.as_deref(),
                    Some(&temp_diff_png),
                    compare_settings,
                );

                match dual {
                    Ok(dual) => {
                        let vs_expected_score = dual.vs_expected.similarity_score;
                        let vs_chrome_score = dual.vs_chrome.as_ref().map(|c| c.similarity_score);
                        // Effective score: prefer whichever oracle we
                        // matched best against. When chrome PNG is
                        // present, this lets a fixture that diverges
                        // from expected.png but matches Chrome still
                        // count as passing.
                        let effective_score = vs_chrome_score
                            .map(|c| c.max(vs_expected_score))
                            .unwrap_or(vs_expected_score);
                        let diff_pct = 100.0 * (1.0 - effective_score.clamp(0.0, 1.0));

                        let category = get_score_category(effective_score);
                        let category_dir = output_dir.join(category);
                        std::fs::create_dir_all(&category_dir).with_context(|| {
                            format!(
                                "failed to create category directory {}",
                                category_dir.display()
                            )
                        })?;

                        let final_current_png =
                            category_dir.join(format!("{}.current.png", pair.test_name));
                        let final_expected_png =
                            category_dir.join(format!("{}.expected.png", pair.test_name));
                        let final_chrome_png =
                            category_dir.join(format!("{}.chrome.png", pair.test_name));
                        let final_diff_png =
                            category_dir.join(format!("{}.diff.png", pair.test_name));

                        std::fs::copy(&pair.ref_png_path, &final_expected_png).with_context(
                            || {
                                format!(
                                    "failed to copy reference PNG to {}",
                                    final_expected_png.display()
                                )
                            },
                        )?;

                        std::fs::rename(&temp_output_png, &final_current_png).with_context(
                            || {
                                format!(
                                    "failed to move output PNG to {}",
                                    final_current_png.display()
                                )
                            },
                        )?;

                        let chrome_png_str = if let Some(src) = chrome_baseline_png.as_deref() {
                            std::fs::copy(src, &final_chrome_png).with_context(|| {
                                format!(
                                    "failed to copy chrome baseline PNG to {}",
                                    final_chrome_png.display()
                                )
                            })?;
                            Some(final_chrome_png.to_string_lossy().to_string())
                        } else {
                            None
                        };

                        let diff_png_str = if temp_diff_png.exists() {
                            std::fs::rename(&temp_diff_png, &final_diff_png).with_context(
                                || {
                                    format!(
                                        "failed to move diff PNG to {}",
                                        final_diff_png.display()
                                    )
                                },
                            )?;
                            Some(final_diff_png.to_string_lossy().to_string())
                        } else {
                            None
                        };

                        // Carry through the better of the two compare
                        // errors (if either had one) — typically a
                        // dimension mismatch from one side.
                        let error = dual
                            .vs_expected
                            .error
                            .clone()
                            .or_else(|| dual.vs_chrome.as_ref().and_then(|c| c.error.clone()));

                        // Classify oracle status.
                        let oracle_status = oracle_flags.map(|f| f.classify()).or_else(|| {
                            // No CSV row at all: mark "unknown" so
                            // dashboards can split it out.
                            if oracle_key.is_some() && oracles.len() > 0 {
                                Some(OracleStatus::Unknown)
                            } else {
                                None
                            }
                        });

                        // Record which oracle the diff PNG is taken
                        // against, for dashboard/debug purposes.
                        let _ = dual.diff_against;

                        test_results.push(TestResult {
                            test_name: pair.test_name.clone(),
                            similarity_score: effective_score,
                            diff_percentage: diff_pct,
                            output_png: final_current_png.to_string_lossy().to_string(),
                            diff_png: diff_png_str,
                            vs_expected: Some(vs_expected_score),
                            vs_chrome: vs_chrome_score,
                            chrome_png: chrome_png_str,
                            oracle_flags,
                            oracle_status,
                            error,
                        });

                        pb.set_message(format!("{:.2}% → {}", effective_score * 100.0, category));
                    }
                    Err(e) => {
                        let err_dir = output_dir.join("err");
                        std::fs::create_dir_all(&err_dir).with_context(|| {
                            format!("failed to create error directory {}", err_dir.display())
                        })?;

                        let final_expected_png =
                            err_dir.join(format!("{}.expected.png", pair.test_name));
                        let final_current_png =
                            err_dir.join(format!("{}.current.png", pair.test_name));
                        std::fs::copy(&pair.ref_png_path, &final_expected_png).with_context(
                            || {
                                format!(
                                    "failed to copy reference PNG to {}",
                                    final_expected_png.display()
                                )
                            },
                        )?;

                        if temp_output_png.exists() {
                            std::fs::rename(&temp_output_png, &final_current_png).with_context(
                                || {
                                    format!(
                                        "failed to move output PNG to {}",
                                        final_current_png.display()
                                    )
                                },
                            )?;
                        }

                        test_results.push(TestResult {
                            test_name: pair.test_name.clone(),
                            similarity_score: 0.0,
                            diff_percentage: 100.0,
                            output_png: final_current_png.to_string_lossy().to_string(),
                            diff_png: None,
                            vs_expected: None,
                            vs_chrome: None,
                            chrome_png: None,
                            oracle_flags,
                            oracle_status: oracle_flags.map(|f| f.classify()),
                            error: Some(format!("Comparison failed: {}", e)),
                        });

                        pb.set_message("error → err".to_string());
                    }
                }
            }
            Err(e) => {
                let err_dir = output_dir.join("err");
                std::fs::create_dir_all(&err_dir).with_context(|| {
                    format!("failed to create error directory {}", err_dir.display())
                })?;

                let final_expected_png = err_dir.join(format!("{}.expected.png", pair.test_name));
                std::fs::copy(&pair.ref_png_path, &final_expected_png).with_context(|| {
                    format!(
                        "failed to copy reference PNG to {}",
                        final_expected_png.display()
                    )
                })?;

                test_results.push(TestResult {
                    test_name: pair.test_name.clone(),
                    similarity_score: 0.0,
                    diff_percentage: 100.0,
                    output_png: String::new(),
                    diff_png: None,
                    vs_expected: None,
                    vs_chrome: None,
                    chrome_png: None,
                    oracle_flags,
                    oracle_status: oracle_flags.map(|f| f.classify()),
                    error: Some(format!("Rendering failed: {}", e)),
                });

                pb.set_message("render error → err".to_string());
            }
        }

        pb.inc(1);
    }

    // Generate report
    let report = ReftestReport::new(&args.suite_dir, &output_dir, test_results, pass_floor);
    let report_path = output_dir.join("report.json");
    generate_json_report(&report, &report_path)?;

    pb.finish_with_message(format!(
        "Report: {} | total={} avg={:.2}% min={:.2}% max={:.2}%",
        report_path.display(),
        report.total,
        report.average_similarity * 100.0,
        report.min_similarity * 100.0,
        report.max_similarity * 100.0
    ));

    println!("\nReport generated: {}", report_path.display());
    println!("Total tests: {}", report.total);
    println!(
        "Average similarity: {:.2}%",
        report.average_similarity * 100.0
    );
    println!("Min similarity: {:.2}%", report.min_similarity * 100.0);
    println!("Max similarity: {:.2}%", report.max_similarity * 100.0);

    let buckets = &report.oracle_buckets;
    if buckets.consensus.total + buckets.disputed.total + buckets.ub.total > 0 {
        let consensus_rate = if buckets.consensus.total > 0 {
            100.0 * buckets.consensus.passing as f64 / buckets.consensus.total as f64
        } else {
            0.0
        };
        println!(
            "\n── Oracle buckets (pass floor = {:.2}) ──",
            buckets.pass_floor
        );
        println!(
            "consensus : n={:<5} avg={:.3}  passing={} ({:.2}%)  vs_expected={:.3}{}",
            buckets.consensus.total,
            buckets.consensus.avg_similarity,
            buckets.consensus.passing,
            consensus_rate,
            buckets.consensus.avg_vs_expected,
            buckets
                .consensus
                .avg_vs_chrome
                .map(|v| format!("  vs_chrome={v:.3}"))
                .unwrap_or_default(),
        );
        println!(
            "disputed  : n={:<5} avg={:.3}  vs_expected={:.3}{}",
            buckets.disputed.total,
            buckets.disputed.avg_similarity,
            buckets.disputed.avg_vs_expected,
            buckets
                .disputed
                .avg_vs_chrome
                .map(|v| format!("  vs_chrome={v:.3}"))
                .unwrap_or_default(),
        );
        println!(
            "ub        : n={:<5} (excluded from headline parity)",
            buckets.ub.total
        );
        if buckets.unknown.total > 0 {
            println!("unknown   : n={:<5} (no oracle row)", buckets.unknown.total);
        }
    }

    Ok(())
}

/// Compare the rendered output against `expected.png`, and against
/// `chrome_baseline.png` when one is available. Returns both scores
/// plus the diff image taken against whichever oracle the rendered
/// output is *closer* to (so diffs in the dashboard are meaningful).
fn dual_compare(
    actual: &Path,
    expected: &Path,
    chrome: Option<&Path>,
    diff_output: Option<&Path>,
    settings: CompareSettings,
) -> Result<DualScore> {
    // Always compare against expected. We take the diff here, then
    // possibly overwrite it with the chrome diff if chrome scores
    // higher (and is enabled).
    let vs_expected = compare_images(
        actual,
        expected,
        diff_output,
        settings.threshold,
        settings.detect_aa,
        settings.bg,
        settings.mask,
    )
    .with_context(|| format!("compare against expected.png ({})", expected.display()))?;

    let Some(chrome_path) = chrome else {
        return Ok(DualScore {
            vs_expected,
            vs_chrome: None,
            diff_against: DiffAgainst::Expected,
        });
    };

    // Compare against Chrome PNG. We always run this to a *separate*
    // temp file first, then decide which diff to keep based on which
    // oracle won.
    let chrome_diff_tmp = diff_output.map(|p| {
        let parent = p.parent().unwrap_or(Path::new("."));
        let stem = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        parent.join(format!("{stem}-chrome.png"))
    });

    let vs_chrome = compare_images(
        actual,
        chrome_path,
        chrome_diff_tmp.as_deref(),
        settings.threshold,
        settings.detect_aa,
        settings.bg,
        settings.mask,
    )
    .with_context(|| {
        format!(
            "compare against chrome baseline ({})",
            chrome_path.display()
        )
    })?;

    // Pick the diff PNG to keep — whichever side the renderer
    // matched best against is more useful to inspect.
    let diff_against = if vs_chrome.similarity_score > vs_expected.similarity_score {
        if let Some(out) = diff_output {
            // Replace the expected-diff with the chrome-diff. dify
            // omits the diff PNG entirely when the two images are
            // identical, so a missing chrome temp here means a
            // perfect match — drop the now-misleading expected-diff
            // too, so the dashboard shows "no diff" instead of the
            // huge red diff against expected.
            match chrome_diff_tmp.as_deref() {
                Some(p) if p.exists() => {
                    let _ = std::fs::rename(p, out);
                }
                _ => {
                    let _ = std::fs::remove_file(out);
                }
            }
        }
        DiffAgainst::Chrome
    } else {
        // Keep the expected diff; clean up the chrome temp file.
        if let Some(p) = chrome_diff_tmp.as_deref() {
            let _ = std::fs::remove_file(p);
        }
        DiffAgainst::Expected
    };

    Ok(DualScore {
        vs_expected,
        vs_chrome: Some(vs_chrome),
        diff_against,
    })
}

// Convenience wrapper to match main.rs signature (takes owned args)
pub(crate) async fn run(args: RunArgs) -> Result<()> {
    run_reftest(&args).await
}
