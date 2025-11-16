use crate::reftest::args::{BgColor, ReftestArgs};
use crate::reftest::compare::compare_images;
use crate::reftest::config::ReftestToml;
use crate::reftest::render::{
    find_test_pairs_from_glob, find_test_pairs_in_dirs, render_svg_to_png, TestPair,
};
use crate::reftest::report::{generate_json_report, ReftestReport, TestResult};
use anyhow::{Context, Result};
use image;
use indicatif::{ProgressBar, ProgressStyle};
use std::path::{Path, PathBuf};

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

pub async fn run_reftest(args: &ReftestArgs) -> Result<()> {
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
            output_dir = output_dir.join(sanitize_dir_name(&name));
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

    // Handle existing output directory
    let overwrite = args.overwrite.unwrap_or(true);
    if output_dir.exists() {
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
    for (_index, pair) in test_pairs.iter().enumerate() {
        pb.set_message(format!("processing {}", pair.test_name));

        // Load reference PNG to get target dimensions for scaling
        let target_size = image::open(&pair.ref_png_path).ok().map(|img| {
            let rgba = img.to_rgba8();
            rgba.dimensions()
        });

        // Render SVG to PNG (temporary location first)
        let temp_output_png = output_dir.join(format!("{}-temp-output.png", pair.test_name));

        // Render SVG to PNG, scaling to match reference size
        match render_svg_to_png(&pair.svg_path, &temp_output_png, target_size) {
            Ok(_) => {
                // Compare images
                let temp_diff_png = output_dir.join(format!("{}-temp-diff.png", pair.test_name));
                match compare_images(
                    &temp_output_png,
                    &pair.ref_png_path,
                    Some(&temp_diff_png),
                    threshold,
                    detect_aa,
                    bg,
                ) {
                    Ok(comparison) => {
                        // Determine score category and create subdirectory
                        let category = get_score_category(comparison.similarity_score);
                        let category_dir = output_dir.join(category);
                        std::fs::create_dir_all(&category_dir).with_context(|| {
                            format!(
                                "failed to create category directory {}",
                                category_dir.display()
                            )
                        })?;

                        // Move files to category directory with new naming
                        let final_current_png =
                            category_dir.join(format!("{}.current.png", pair.test_name));
                        let final_expected_png =
                            category_dir.join(format!("{}.expected.png", pair.test_name));
                        let final_diff_png =
                            category_dir.join(format!("{}.diff.png", pair.test_name));

                        // Copy reference PNG as expected.png
                        std::fs::copy(&pair.ref_png_path, &final_expected_png).with_context(
                            || {
                                format!(
                                    "failed to copy reference PNG to {}",
                                    final_expected_png.display()
                                )
                            },
                        )?;

                        // Rename output PNG to current.png
                        std::fs::rename(&temp_output_png, &final_current_png).with_context(
                            || {
                                format!(
                                    "failed to move output PNG to {}",
                                    final_current_png.display()
                                )
                            },
                        )?;

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

                        test_results.push(TestResult {
                            test_name: pair.test_name.clone(),
                            similarity_score: comparison.similarity_score,
                            diff_percentage: comparison.diff_percentage,
                            output_png: final_current_png.to_string_lossy().to_string(),
                            diff_png: diff_png_str,
                            error: comparison.error,
                        });

                        pb.set_message(format!(
                            "{:.2}% → {}",
                            comparison.similarity_score * 100.0,
                            category
                        ));
                    }
                    Err(e) => {
                        // On compare error, route to err directory (not a score bucket)
                        let err_dir = output_dir.join("err");
                        std::fs::create_dir_all(&err_dir).with_context(|| {
                            format!("failed to create error directory {}", err_dir.display())
                        })?;

                        // Copy reference PNG as expected.png
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
                            error: Some(format!("Comparison failed: {}", e)),
                        });

                        pb.set_message("error → err".to_string());
                    }
                }
            }
            Err(e) => {
                // On render error, route to err directory (not a score bucket)
                let err_dir = output_dir.join("err");
                std::fs::create_dir_all(&err_dir).with_context(|| {
                    format!("failed to create error directory {}", err_dir.display())
                })?;

                // Copy reference PNG as expected.png even if rendering failed
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
                    error: Some(format!("Rendering failed: {}", e)),
                });

                pb.set_message("render error → err".to_string());
            }
        }

        pb.inc(1);
    }

    // Generate report
    let report = ReftestReport::new(&args.suite_dir, &output_dir, test_results);
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

    Ok(())
}

// Convenience wrapper to match main.rs signature (takes owned args)
pub async fn run(args: ReftestArgs) -> Result<()> {
    run_reftest(&args).await
}
