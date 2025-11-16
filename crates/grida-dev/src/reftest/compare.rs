use anyhow::{Context, Result};
use dify::diff::{self, RunParams};
use image::{GenericImageView, ImageBuffer, Rgba, RgbaImage};
use std::path::Path;

use crate::reftest::args::BgColor;

pub struct ComparisonResult {
    pub similarity_score: f64, // 0.0 (completely different) to 1.0 (identical)
    pub diff_percentage: f64,  // percentage of pixels that differ
    pub error: Option<String>, // if comparison failed
}

fn composite_to_opaque(img: &RgbaImage, bg: BgColor) -> RgbaImage {
    // out_rgb = rgb * a + bg * (1 - a); out_a = 255; with a in [0,1]
    let (w, h) = img.dimensions();
    let mut out: RgbaImage = ImageBuffer::new(w, h);
    let (bg_r, bg_g, bg_b) = match bg {
        BgColor::White => (255.0, 255.0, 255.0),
        BgColor::Black => (0.0, 0.0, 0.0),
    };
    for (x, y, p) in img.enumerate_pixels() {
        let a = p[3] as f32 / 255.0;
        let r = (p[0] as f32 * a + bg_r * (1.0 - a))
            .round()
            .clamp(0.0, 255.0) as u8;
        let g = (p[1] as f32 * a + bg_g * (1.0 - a))
            .round()
            .clamp(0.0, 255.0) as u8;
        let b = (p[2] as f32 * a + bg_b * (1.0 - a))
            .round()
            .clamp(0.0, 255.0) as u8;
        out.put_pixel(x, y, Rgba([r, g, b, 255]));
    }
    out
}

pub fn compare_images(
    actual: &Path,
    expected: &Path,
    diff_output: Option<&Path>,
    threshold: f32,
    detect_aa: bool,
    bg: BgColor,
) -> Result<ComparisonResult> {
    // Load images and composite to opaque over selected background
    let actual_img_rgba = image::open(actual)
        .with_context(|| format!("failed to load actual image {}", actual.display()))?
        .to_rgba8();
    let expected_img_rgba = image::open(expected)
        .with_context(|| format!("failed to load expected image {}", expected.display()))?
        .to_rgba8();

    let (width, height) = actual_img_rgba.dimensions();
    let total_pixels = (width * height) as f64;

    // If dimensions mismatch, return early
    if expected_img_rgba.dimensions() != (width, height) {
        return Ok(ComparisonResult {
            similarity_score: 0.0,
            diff_percentage: 100.0,
            error: Some(format!(
                "Dimension mismatch: actual {}x{} vs expected {}x{}",
                width,
                height,
                expected_img_rgba.dimensions().0,
                expected_img_rgba.dimensions().1
            )),
        });
    }

    let opaque_actual = composite_to_opaque(&actual_img_rgba, bg);
    let opaque_expected = composite_to_opaque(&expected_img_rgba, bg);

    // Write temporary opaque files for dify to read
    let tmp_dir = std::env::temp_dir();
    let tmp_actual = tmp_dir.join(format!("reftest-opaque-actual-{}.png", std::process::id()));
    let tmp_expected = tmp_dir.join(format!(
        "reftest-opaque-expected-{}.png",
        std::process::id()
    ));
    opaque_actual
        .save(&tmp_actual)
        .with_context(|| format!("failed to save temp opaque image {}", tmp_actual.display()))?;
    opaque_expected.save(&tmp_expected).with_context(|| {
        format!(
            "failed to save temp opaque image {}",
            tmp_expected.display()
        )
    })?;

    // Only generate diff image if output path is provided
    let output_path = if let Some(path) = diff_output {
        path.to_string_lossy().to_string()
    } else {
        std::env::temp_dir()
            .join(format!("dify-temp-{}.png", std::process::id()))
            .to_string_lossy()
            .to_string()
    };

    // Threshold is squared internally by dify; allow 0.0 for strict mode
    let params = RunParams {
        // Use expected as left, actual as right for readability
        left: &tmp_expected.to_string_lossy(),
        right: &tmp_actual.to_string_lossy(),
        output: &output_path,
        threshold,
        output_image_base: None,
        do_not_check_dimensions: false,
        detect_anti_aliased_pixels: detect_aa,
        blend_factor_of_unchanged_pixels: None,
        block_out_areas: None,
    };

    match diff::run(&params) {
        Ok(Some(diff_count)) => {
            let diff_pixels = diff_count as f64;
            let diff_percentage = (diff_pixels / total_pixels) * 100.0;
            let similarity_score = 1.0 - (diff_pixels / total_pixels).min(1.0);

            Ok(ComparisonResult {
                similarity_score,
                diff_percentage,
                error: None,
            })
        }
        Ok(None) => Ok(ComparisonResult {
            similarity_score: 1.0,
            diff_percentage: 0.0,
            error: None,
        }),
        Err(e) => {
            let error_msg = e.to_string();
            if error_msg.contains("dimensions") {
                Ok(ComparisonResult {
                    similarity_score: 0.0,
                    diff_percentage: 100.0,
                    error: Some(error_msg),
                })
            } else {
                Err(e).with_context(|| "failed to compare images using dify")
            }
        }
    }
}
