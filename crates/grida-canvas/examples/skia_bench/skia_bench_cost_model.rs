//! Render Cost Model Validation Benchmark
//!
//! Validates the structural pixel-cost model from
//! `docs/wg/feat-2d/render-cost-prediction.md` against real GPU measurements.
//!
//! Unlike `skia_bench_effects` (10K tiny rects, per-rect overhead), this draws
//! **one rect per iteration at controlled sizes** to isolate per-pixel cost
//! from per-draw-call overhead.
//!
//! Run with:
//! ```bash
//! cargo run -p cg --example skia_bench_cost_model --features native-gl-context --release
//! ```

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("This example requires --features native-gl-context");
}

#[cfg(feature = "native-gl-context")]
fn main() {
    use cg::window::headless::HeadlessGpu;
    use skia_safe::{
        canvas::SaveLayerRec, image_filters, BlendMode, Color, Paint, Rect, Surface,
    };
    use std::time::Instant;

    const W: i32 = 1000;
    const H: i32 = 1000;
    const WARMUP: u32 = 10;
    const ITERS: u32 = 50;

    let mut gpu = HeadlessGpu::new(W, H).expect("GPU init");
    gpu.print_gl_info();
    println!();

    let surface = &mut gpu.surface;

    // ── Helpers ──────────────────────────────────────────────────────

    fn flush(s: &mut Surface) {
        if let Some(mut ctx) = s.recording_context() {
            if let Some(mut d) = ctx.as_direct_context() {
                d.flush_and_submit();
            }
        }
    }

    /// Run a single-rect benchmark at the given size.
    /// Returns the **median** duration in microseconds.
    fn bench_single_rect(
        surface: &mut Surface,
        size: f32,
        draw_fn: &dyn Fn(&skia_safe::Canvas, Rect),
    ) -> f64 {
        let cx = (W as f32 - size) / 2.0;
        let cy = (H as f32 - size) / 2.0;
        let rect = Rect::from_xywh(cx, cy, size, size);

        // Warmup
        for _ in 0..WARMUP {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            draw_fn(canvas, rect);
            flush(surface);
        }

        // Measure
        let mut timings = Vec::with_capacity(ITERS as usize);
        for _ in 0..ITERS {
            let t0 = Instant::now();
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            draw_fn(canvas, rect);
            flush(surface);
            timings.push(t0.elapsed().as_nanos() as f64 / 1000.0); // microseconds
        }
        timings.sort_by(|a, b| a.partial_cmp(b).unwrap());
        timings[timings.len() / 2] // median
    }

    /// Compute R-squared for linear fit of (xs, ys).
    fn r_squared(xs: &[f64], ys: &[f64]) -> f64 {
        let n = xs.len() as f64;
        let x_mean = xs.iter().sum::<f64>() / n;
        let y_mean = ys.iter().sum::<f64>() / n;
        let ss_xy: f64 = xs.iter().zip(ys).map(|(x, y)| (x - x_mean) * (y - y_mean)).sum();
        let ss_xx: f64 = xs.iter().map(|x| (x - x_mean).powi(2)).sum();
        let ss_yy: f64 = ys.iter().map(|y| (y - y_mean).powi(2)).sum();
        if ss_xx == 0.0 || ss_yy == 0.0 {
            return 0.0;
        }
        let r = ss_xy / (ss_xx * ss_yy).sqrt();
        r * r
    }

    // ── Variant definitions ─────────────────────────────────────────

    struct Variant {
        name: &'static str,
        predicted: f64,
        draw: Box<dyn Fn(&skia_safe::Canvas, Rect)>,
    }

    let shadow_filter_s8 = image_filters::drop_shadow(
        (4.0, 4.0),
        (8.0, 8.0),
        Color::from_argb(128, 0, 0, 0),
        None,
        None,
        None,
    );

    let shadow_filter_s8_only = image_filters::drop_shadow_only(
        (2.0, 2.0),
        (6.0, 6.0),
        Color::from_argb(128, 0, 0, 0),
        None,
        None,
        None,
    );

    let blur_filter_5 = image_filters::blur((5.0, 5.0), None, None, None);
    let blur_filter_50 = image_filters::blur((50.0, 50.0), None, None, None);
    let backdrop_blur_8 = image_filters::blur((8.0, 8.0), None, None, None).unwrap();

    // Clone filters for closures
    let sf8 = shadow_filter_s8.clone();
    let sf8o = shadow_filter_s8_only.clone();
    let bf5 = blur_filter_5.clone();
    let bf50 = blur_filter_50.clone();
    let sf8_for_combo = shadow_filter_s8.clone();
    let bf5_for_combo = blur_filter_5.clone();
    let bd8 = backdrop_blur_8.clone();

    let variants: Vec<Variant> = vec![
        // 1. Baseline
        Variant {
            name: "baseline (solid rect)",
            predicted: 1.0,
            draw: Box::new(|canvas, rect| {
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
            }),
        },
        // 2. +1 extra fill
        Variant {
            name: "+1 fill (2 fills total)",
            predicted: 2.0,
            draw: Box::new(|canvas, rect| {
                let mut p1 = Paint::default();
                p1.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p1);
                let mut p2 = Paint::default();
                p2.set_color(Color::from_argb(128, 255, 0, 0));
                canvas.draw_rect(rect, &p2);
            }),
        },
        // 3. +2 extra fills
        Variant {
            name: "+2 fills (3 fills total)",
            predicted: 3.0,
            draw: Box::new(|canvas, rect| {
                let mut p1 = Paint::default();
                p1.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p1);
                let mut p2 = Paint::default();
                p2.set_color(Color::from_argb(128, 255, 0, 0));
                canvas.draw_rect(rect, &p2);
                let mut p3 = Paint::default();
                p3.set_color(Color::from_argb(128, 0, 255, 0));
                canvas.draw_rect(rect, &p3);
            }),
        },
        // 4. +1 stroke
        Variant {
            name: "+1 stroke",
            predicted: 2.0,
            draw: Box::new(|canvas, rect| {
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                let mut s = Paint::default();
                s.set_color(Color::BLACK);
                s.set_style(skia_safe::PaintStyle::Stroke);
                s.set_stroke_width(2.0);
                canvas.draw_rect(rect, &s);
            }),
        },
        // 5. Non-normal blend mode (save_layer)
        Variant {
            name: "blend mode (Multiply)",
            predicted: 2.0,
            draw: Box::new(|canvas, rect| {
                let mut lp = Paint::default();
                lp.set_blend_mode(BlendMode::Multiply);
                let rec = SaveLayerRec::default().bounds(&rect).paint(&lp);
                canvas.save_layer(&rec);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
            }),
        },
        // 6. Opacity (save_layer_alpha)
        Variant {
            name: "opacity 0.5 (save_layer_alpha)",
            predicted: 2.0,
            draw: Box::new(|canvas, rect| {
                canvas.save_layer_alpha(Some(rect),128);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
            }),
        },
        // 7. Gaussian blur (r=5)
        Variant {
            name: "blur (r=5)",
            predicted: 4.0,
            draw: Box::new(move |canvas, rect| {
                let mut lp = Paint::default();
                lp.set_image_filter(bf5.clone());
                let rec = SaveLayerRec::default().bounds(&rect).paint(&lp);
                canvas.save_layer(&rec);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
            }),
        },
        // 8. Gaussian blur (r=50) — should be ~same cost (radius independence)
        Variant {
            name: "blur (r=50)",
            predicted: 4.0,
            draw: Box::new(move |canvas, rect| {
                let mut lp = Paint::default();
                lp.set_image_filter(bf50.clone());
                let rec = SaveLayerRec::default().bounds(&rect).paint(&lp);
                canvas.save_layer(&rec);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
            }),
        },
        // 9. Drop shadow (with content)
        Variant {
            name: "drop shadow (s=8)",
            predicted: 6.0,
            draw: Box::new(move |canvas, rect| {
                let mut lp = Paint::default();
                lp.set_image_filter(sf8.clone());
                let rec = SaveLayerRec::default().bounds(&rect).paint(&lp);
                canvas.save_layer(&rec);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
            }),
        },
        // 10. Inner shadow (clip + shadow_only)
        Variant {
            name: "inner shadow (s=6)",
            predicted: 6.0,
            draw: Box::new(move |canvas, rect| {
                // Base rect
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 240, 240, 240));
                canvas.draw_rect(rect, &p);
                // Clipped inner shadow
                canvas.save();
                canvas.clip_rect(rect, None, None);
                let mut lp = Paint::default();
                lp.set_image_filter(sf8o.clone());
                let rec = SaveLayerRec::default().bounds(&rect).paint(&lp);
                canvas.save_layer(&rec);
                let mut sp = Paint::default();
                sp.set_color(Color::from_argb(255, 240, 240, 240));
                canvas.draw_rect(rect, &sp);
                canvas.restore();
                canvas.restore();
            }),
        },
        // 11. Drop shadow + blur combined
        Variant {
            name: "shadow + blur combo",
            predicted: 9.0,
            draw: Box::new(move |canvas, rect| {
                // Outer: blur
                let mut blur_p = Paint::default();
                blur_p.set_image_filter(bf5_for_combo.clone());
                let blur_rec = SaveLayerRec::default().bounds(&rect).paint(&blur_p);
                canvas.save_layer(&blur_rec);
                // Inner: shadow
                let mut shadow_p = Paint::default();
                shadow_p.set_image_filter(sf8_for_combo.clone());
                let shadow_rec = SaveLayerRec::default().bounds(&rect).paint(&shadow_p);
                canvas.save_layer(&shadow_rec);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
                canvas.restore();
            }),
        },
        // 12. 2x nested save_layer (no effects, pure isolation cost)
        Variant {
            name: "2x nested save_layer",
            predicted: 5.0,
            draw: Box::new(|canvas, rect| {
                canvas.save_layer_alpha(Some(rect),255);
                canvas.save_layer_alpha(Some(rect),255);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
                canvas.restore();
            }),
        },
        // 13. 3x nested save_layer
        Variant {
            name: "3x nested save_layer",
            predicted: 7.0,
            draw: Box::new(|canvas, rect| {
                canvas.save_layer_alpha(Some(rect),255);
                canvas.save_layer_alpha(Some(rect),255);
                canvas.save_layer_alpha(Some(rect),255);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
                canvas.restore();
                canvas.restore();
            }),
        },
        // 14. Backdrop blur
        Variant {
            name: "backdrop blur (s=8)",
            predicted: 4.0,
            draw: Box::new(move |canvas, rect| {
                // Background content
                let mut bg = Paint::default();
                bg.set_color(Color::from_argb(255, 200, 50, 100));
                canvas.draw_rect(rect, &bg);
                // Backdrop blur layer on top
                let lp = Paint::default();
                let rec = SaveLayerRec::default()
                    .bounds(&rect)
                    .backdrop(&bd8)
                    .paint(&lp);
                canvas.save_layer(&rec);
                let mut overlay = Paint::default();
                overlay.set_color(Color::from_argb(80, 255, 255, 255));
                canvas.draw_rect(rect, &overlay);
                canvas.restore();
            }),
        },
    ];

    // ── Run benchmarks ──────────────────────────────────────────────

    let sizes: [f32; 8] = [50.0, 100.0, 200.0, 300.0, 500.0, 1000.0, 2000.0, 4000.0];
    let pixel_areas: Vec<f64> = sizes.iter().map(|s| (*s as f64) * (*s as f64)).collect();

    // results[variant_idx][size_idx] = median_us
    let mut results: Vec<Vec<f64>> = Vec::new();

    for (vi, variant) in variants.iter().enumerate() {
        let mut row = Vec::new();
        for &size in &sizes {
            let us = bench_single_rect(surface, size, &*variant.draw);
            row.push(us);
        }
        eprint!("\r  [{}/{}] {:<35}", vi + 1, variants.len(), variant.name);
        results.push(row);
    }
    eprintln!("\r  Done.{:40}", "");

    // ── Output Section 1: Cost Multiplier Table (at 200²) ───────────

    let size_idx_200 = 2; // 200.0 is index 2
    let baseline_200 = results[0][size_idx_200];

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 1: Cost Multiplier Validation (at 200×200)");
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!(
        "  {:<35} {:>10} {:>10} {:>10} {:>6}",
        "Effect", "Predicted", "Measured", "Time(µs)", "Status"
    );
    println!("  {:-<35} {:->10} {:->10} {:->10} {:->6}", "", "", "", "", "");

    for (vi, variant) in variants.iter().enumerate() {
        let time_us = results[vi][size_idx_200];
        let measured = time_us / baseline_200;
        let ratio = measured / variant.predicted;
        let status = if ratio >= 0.5 && ratio <= 2.0 { "OK" } else { "WARN" };
        println!(
            "  {:<35} {:>9.1}× {:>9.2}× {:>10.1} {:>6}",
            variant.name, variant.predicted, measured, time_us, status
        );
    }

    // ── Output Section 2: Linearity Table ───────────────────────────

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 2: Linearity (time vs. pixel area)");
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!(
        "  {:<35} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>6}",
        "Effect", "50²", "100²", "200²", "300²", "500²", "1000²", "2000²", "4000²", "R²"
    );
    println!(
        "  {:-<35} {:->7} {:->7} {:->7} {:->7} {:->7} {:->7} {:->7} {:->7} {:->6}",
        "", "", "", "", "", "", "", "", "", ""
    );

    for (vi, variant) in variants.iter().enumerate() {
        let row = &results[vi];
        let r2 = r_squared(&pixel_areas, row);
        println!(
            "  {:<35} {:>7.0} {:>7.0} {:>7.0} {:>7.0} {:>7.0} {:>7.0} {:>7.0} {:>7.0} {:>5.3}",
            variant.name, row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], r2
        );
    }

    // ── Output Section 3: Blur Radius Independence ──────────────────

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 3: Blur Radius Independence (r=5 vs r=50)");
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!(
        "  {:<10} {:>10} {:>10} {:>10}",
        "Size", "r=5 (µs)", "r=50 (µs)", "Ratio"
    );
    println!("  {:-<10} {:->10} {:->10} {:->10}", "", "", "", "");

    let blur5_idx = 6; // "blur (r=5)"
    let blur50_idx = 7; // "blur (r=50)"
    for (si, &size) in sizes.iter().enumerate() {
        let t5 = results[blur5_idx][si];
        let t50 = results[blur50_idx][si];
        let ratio = t50 / t5;
        println!(
            "  {:<10} {:>10.1} {:>10.1} {:>9.2}×",
            format!("{}²", size as i32),
            t5,
            t50,
            ratio
        );
    }

    // ── Output Section 4: Device Fill Rate Calibration ──────────────

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 4: Device Fill Rate Calibration");
    println!("═══════════════════════════════════════════════════════════════════════════");

    // Use baseline at 500² for the most stable measurement
    let baseline_500_us = results[0][4]; // 500² = 250_000 pixels
    let pixels_500 = 500.0 * 500.0;
    let pixels_per_us = pixels_500 / baseline_500_us;
    let pixels_per_ms = pixels_per_us * 1000.0;
    let budget_12ms = pixels_per_ms * 12.0;

    println!("  Baseline (solid rect) at 500×500: {:.1} µs", baseline_500_us);
    println!("  Fill rate: {:.1}M pixels/ms", pixels_per_ms / 1_000_000.0);
    println!(
        "  12ms frame budget: {:.1}B pixels ({:.0}M pixels)",
        budget_12ms / 1_000_000_000.0,
        budget_12ms / 1_000_000.0
    );
    println!();

    println!("  Reference (from docs/wg/feat-2d/render-cost-prediction.md):");
    println!("    Desktop GPU (discrete)   ~500M pixels/ms");
    println!("    Desktop GPU (integrated) ~100M pixels/ms");
    println!("    WebGL (WASM, desktop)    ~50-100M pixels/ms");
    println!("    WebGL (WASM, mobile)     ~10-30M pixels/ms");

    // ── Output Section 5: Two-Component Formula Extraction ──────────

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 5: Two-Component Formula (C_fixed + area × C_per_pixel)");
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  Solving from 200² and 4000² measurements:");
    println!();
    println!(
        "  {:<35} {:>10} {:>10} {:>12} {:>12}",
        "Effect", "C_fixed(µs)", "C_pixel(ns/px)", "t@200²(µs)", "t@4000²(µs)"
    );
    println!(
        "  {:-<35} {:->10} {:->10} {:->12} {:->12}",
        "", "", "", "", ""
    );

    let area_small = 200.0_f64 * 200.0; // 40,000
    let area_large = 4000.0_f64 * 4000.0; // 16,000,000
    let idx_200 = 2usize; // index of 200.0 in sizes
    let idx_4000 = 7usize; // index of 4000.0 in sizes

    for (vi, variant) in variants.iter().enumerate() {
        let t_small = results[vi][idx_200];
        let t_large = results[vi][idx_4000];

        // Solve: t_small = C_fixed + area_small * C_pixel
        //        t_large = C_fixed + area_large * C_pixel
        // → C_pixel = (t_large - t_small) / (area_large - area_small)
        // → C_fixed = t_small - area_small * C_pixel
        let c_pixel = (t_large - t_small) / (area_large - area_small); // µs per pixel
        let c_fixed = t_small - area_small * c_pixel;

        let c_pixel_ns = c_pixel * 1000.0; // ns per pixel

        println!(
            "  {:<35} {:>10.1} {:>10.3} {:>12.1} {:>12.1}",
            variant.name,
            c_fixed.max(0.0),
            c_pixel_ns.max(0.0),
            t_small,
            t_large
        );
    }

    println!();
    println!("  C_fixed = per-save_layer FBO/pipeline overhead (device-specific)");
    println!("  C_pixel = per-pixel bandwidth cost (ns/pixel)");
    println!("  Cost model: node_cost = C_fixed + screen_area × C_pixel × passes");
    println!();
}
