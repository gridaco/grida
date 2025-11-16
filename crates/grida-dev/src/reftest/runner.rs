use crate::reftest::args::ReftestArgs;
use crate::reftest::compare::compare_images;
use crate::reftest::render::{find_test_pairs, render_svg_to_png};
use crate::reftest::report::{generate_json_report, ReftestReport, TestResult};
use anyhow::{Context, Result};
use indicatif::{ProgressBar, ProgressStyle};
use std::path::{Path, PathBuf};

fn repo_target_reftests_dir() -> PathBuf {
    // CARGO_MANIFEST_DIR points to crates/grida-dev
    // target directory is at workspace root, so go up two levels
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .and_then(|p| p.parent())
        .unwrap_or(manifest_dir)
        .join("target")
        .join("reftests")
}

fn get_score_category(score: f64) -> &'static str {
    // Convert similarity score to percentage and bucket into S75/S90/S95/S99
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
    // Determine output directory
    let output_dir = args
        .output_dir
        .as_ref()
        .cloned()
        .unwrap_or_else(repo_target_reftests_dir);

    // Handle existing output directory
    let overwrite = args.overwrite.unwrap_or(true); // Default to true
    if output_dir.exists() {
        if overwrite {
            // Clear the directory
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

    // Create output directory
    std::fs::create_dir_all(&output_dir)
        .with_context(|| format!("failed to create output directory {}", output_dir.display()))?;

    println!("Discovering test pairs from {}", args.suite_dir.display());
    let mut test_pairs = find_test_pairs(&args.suite_dir)?;

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
    for (index, pair) in test_pairs.iter().enumerate() {
        pb.set_message(format!("processing {}", pair.test_name));

        // Render SVG to PNG (temporary location first)
        let temp_output_png = output_dir.join(format!("{}-temp-output.png", pair.test_name));

        // Render SVG to PNG
        match render_svg_to_png(&pair.svg_path, &temp_output_png) {
            Ok(_) => {
                // Compare images
                let temp_diff_png = output_dir.join(format!("{}-temp-diff.png", pair.test_name));
                match compare_images(
                    &temp_output_png,
                    &pair.ref_png_path,
                    Some(&temp_diff_png),
                    args.threshold,
                    args.detect_anti_aliasing,
                    args.bg,
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
                        // Move to lowest category on error
                        let category = "S75";
                        let category_dir = output_dir.join(category);
                        std::fs::create_dir_all(&category_dir).with_context(|| {
                            format!(
                                "failed to create category directory {}",
                                category_dir.display()
                            )
                        })?;

                        // Copy reference PNG as expected.png
                        let final_expected_png =
                            category_dir.join(format!("{}.expected.png", pair.test_name));
                        let final_current_png =
                            category_dir.join(format!("{}.current.png", pair.test_name));
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

                        pb.set_message(format!("error → {}", category));
                    }
                }
            }
            Err(e) => {
                // Move to lowest category on render error
                let category = "S75";
                let category_dir = output_dir.join(category);
                std::fs::create_dir_all(&category_dir).with_context(|| {
                    format!(
                        "failed to create category directory {}",
                        category_dir.display()
                    )
                })?;

                // Copy reference PNG as expected.png even if rendering failed
                let final_expected_png =
                    category_dir.join(format!("{}.expected.png", pair.test_name));
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

                pb.set_message("render error → S75".to_string());
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
