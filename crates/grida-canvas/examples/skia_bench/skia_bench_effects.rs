//! Effect Cost Microbenchmark
//!
//! Measures the GPU cost of individual visual effects against a baseline
//! of 10K plain black rects. Each bench draws N rects with a specific
//! effect applied, flushes the GPU, and reports per-rect cost.
//!
//! Run with:
//! ```bash
//! cargo run -p cg --example skia_bench_effects --features native-gl-context --release
//! ```
//!
//! Results go to stdout as a ranked table.

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("This example requires --features native-gl-context");
}

#[cfg(feature = "native-gl-context")]
fn main() {
    use cg::window::headless::HeadlessGpu;
    use skia_safe::{
        canvas::SaveLayerRec, color_filters, image_filters, Color, Paint, Rect, Surface,
    };
    use std::time::{Duration, Instant};

    const W: i32 = 1000;
    const H: i32 = 1000;
    const WARMUP: u32 = 5;
    const ITERS: u32 = 30;
    const RECT_SIZE: f32 = 8.0;

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

    fn grid_pos(i: usize) -> (f32, f32) {
        let col = (i % 100) as f32;
        let row = (i / 100) as f32;
        (col * 10.0, row * 10.0)
    }

    struct BenchResult {
        name: &'static str,
        count: usize,
        avg_frame_us: f64,
        per_rect_us: f64,
    }

    fn run_bench(
        surface: &mut Surface,
        name: &'static str,
        count: usize,
        draw_fn: &dyn Fn(&skia_safe::Canvas, usize),
    ) -> BenchResult {
        // warmup
        for _ in 0..WARMUP {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                draw_fn(canvas, i);
            }
            flush(surface);
        }

        // measure (draw + flush together)
        let mut total = Duration::ZERO;
        for _ in 0..ITERS {
            let t0 = Instant::now();
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                draw_fn(canvas, i);
            }
            flush(surface);
            total += t0.elapsed();
        }

        let avg_us = total.as_micros() as f64 / ITERS as f64;
        let per_rect = avg_us / count as f64;

        BenchResult {
            name,
            count,
            avg_frame_us: avg_us,
            per_rect_us: per_rect,
        }
    }

    // ── Define the benchmarks ───────────────────────────────────────

    let mut results: Vec<BenchResult> = Vec::new();

    // 1. BASELINE: plain black rect fill
    for &count in &[1000, 10000] {
        let r = run_bench(surface, "baseline (black rect)", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let mut p = Paint::default();
            p.set_color(Color::BLACK);
            canvas.draw_rect(Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE), &p);
        });
        results.push(r);
    }

    // 2. Solid color rect (non-black, to check color doesn't matter)
    results.push(run_bench(
        surface,
        "solid color rect",
        10000,
        &|canvas, i| {
            let (x, y) = grid_pos(i);
            let mut p = Paint::default();
            p.set_color(Color::from_argb(255, 66, 133, 244));
            canvas.draw_rect(Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE), &p);
        },
    ));

    // 3. Rounded rect (border-radius)
    results.push(run_bench(
        surface,
        "rounded rect (r=3)",
        10000,
        &|canvas, i| {
            let (x, y) = grid_pos(i);
            let mut p = Paint::default();
            p.set_color(Color::BLACK);
            let rrect = skia_safe::RRect::new_rect_xy(
                Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE),
                3.0,
                3.0,
            );
            canvas.draw_rrect(rrect, &p);
        },
    ));

    // 4. Anti-aliased rect
    results.push(run_bench(
        surface,
        "rect (anti-aliased)",
        10000,
        &|canvas, i| {
            let (x, y) = grid_pos(i);
            let mut p = Paint::default();
            p.set_color(Color::BLACK);
            p.set_anti_alias(true);
            canvas.draw_rect(Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE), &p);
        },
    ));

    // 5. Rect with opacity (simple alpha on paint — no save_layer)
    results.push(run_bench(
        surface,
        "rect + opacity (paint alpha)",
        10000,
        &|canvas, i| {
            let (x, y) = grid_pos(i);
            let mut p = Paint::default();
            p.set_color(Color::from_argb(128, 0, 0, 0));
            canvas.draw_rect(Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE), &p);
        },
    ));

    // 6. Rect with opacity via save_layer (the expensive way)
    results.push(run_bench(
        surface,
        "rect + opacity (save_layer)",
        1000,
        &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut lp = Paint::default();
            lp.set_alpha(128);
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut p = Paint::default();
            p.set_color(Color::BLACK);
            canvas.draw_rect(bounds, &p);
            canvas.restore();
        },
    ));

    // 7. Color filter: brightness (4x5 color matrix — cheap)
    {
        let brightness_cf = color_filters::matrix_row_major(
            &[
                1.2, 0.0, 0.0, 0.0, 0.0, // R
                0.0, 1.2, 0.0, 0.0, 0.0, // G
                0.0, 0.0, 1.2, 0.0, 0.0, // B
                0.0, 0.0, 0.0, 1.0, 0.0, // A
            ],
            None,
        );
        results.push(run_bench(
            surface,
            "rect + brightness (color filter)",
            10000,
            &|canvas, i| {
                let (x, y) = grid_pos(i);
                let mut p = Paint::default();
                p.set_color(Color::BLACK);
                p.set_color_filter(brightness_cf.clone());
                canvas.draw_rect(Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE), &p);
            },
        ));
    }

    // 8. Color filter: grayscale matrix
    {
        let grayscale_cf = color_filters::matrix_row_major(
            &[
                0.2126, 0.7152, 0.0722, 0.0, 0.0, 0.2126, 0.7152, 0.0722, 0.0, 0.0, 0.2126, 0.7152,
                0.0722, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0,
            ],
            None,
        );
        results.push(run_bench(
            surface,
            "rect + grayscale (color filter)",
            10000,
            &|canvas, i| {
                let (x, y) = grid_pos(i);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 200, 100, 50));
                p.set_color_filter(grayscale_cf.clone());
                canvas.draw_rect(Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE), &p);
            },
        ));
    }

    // 9. Blur via save_layer (sigma=4, small)
    for &(sigma, count) in &[(4.0_f32, 1000), (8.0, 500), (20.0, 200)] {
        let blur_filter = image_filters::blur((sigma, sigma), None, None, None);
        let label: &'static str = match sigma as u32 {
            4 => "blur sigma=4 (save_layer)",
            8 => "blur sigma=8 (save_layer)",
            _ => "blur sigma=20 (save_layer)",
        };
        results.push(run_bench(surface, label, count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut lp = Paint::default();
            lp.set_image_filter(blur_filter.clone());
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut p = Paint::default();
            p.set_color(Color::BLACK);
            canvas.draw_rect(bounds, &p);
            canvas.restore();
        }));
    }

    // 10. Blur on LARGER rects (100x100 — more pixels to blur)
    for &(sigma, count) in &[(4.0_f32, 200), (8.0, 200), (20.0, 100)] {
        let blur_filter = image_filters::blur((sigma, sigma), None, None, None);
        let label: &'static str = match sigma as u32 {
            4 => "blur s=4 (100x100 rect)",
            8 => "blur s=8 (100x100 rect)",
            _ => "blur s=20 (100x100 rect)",
        };
        results.push(run_bench(surface, label, count, &|canvas, i| {
            let col = (i % 10) as f32;
            let row = (i / 10) as f32;
            let x = col * 100.0;
            let y = row * 100.0;
            let bounds = Rect::from_xywh(x, y, 100.0, 100.0);
            let mut lp = Paint::default();
            lp.set_image_filter(blur_filter.clone());
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut p = Paint::default();
            p.set_color(Color::from_argb(255, 100, 150, 200));
            canvas.draw_rect(bounds, &p);
            canvas.restore();
        }));
    }

    // 11. Drop shadow (shadow only)
    for &(sigma, count) in &[(4.0_f32, 1000), (8.0, 500), (20.0, 200)] {
        let shadow_filter = image_filters::drop_shadow_only(
            (4.0, 4.0),
            (sigma, sigma),
            Color::from_argb(128, 0, 0, 0),
            None,
            None,
            None,
        );
        let label: &'static str = match sigma as u32 {
            4 => "drop-shadow s=4 (shadow only)",
            8 => "drop-shadow s=8 (shadow only)",
            _ => "drop-shadow s=20 (shadow only)",
        };
        results.push(run_bench(surface, label, count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut lp = Paint::default();
            lp.set_image_filter(shadow_filter.clone());
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut p = Paint::default();
            p.set_color(Color::BLACK);
            canvas.draw_rect(bounds, &p);
            canvas.restore();
        }));
    }

    // 12. Drop shadow + foreground (shadow AND content)
    {
        let shadow_filter = image_filters::drop_shadow(
            (4.0, 4.0),
            (8.0, 8.0),
            Color::from_argb(128, 0, 0, 0),
            None,
            None,
            None,
        );
        results.push(run_bench(
            surface,
            "drop-shadow s=8 (with content)",
            500,
            &|canvas, i| {
                let (x, y) = grid_pos(i);
                let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
                let mut lp = Paint::default();
                lp.set_image_filter(shadow_filter.clone());
                let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
                canvas.save_layer(&rec);
                let mut p = Paint::default();
                p.set_color(Color::BLACK);
                canvas.draw_rect(bounds, &p);
                canvas.restore();
            },
        ));
    }

    // 13. Inner shadow (clip + inverted shadow)
    {
        let inner_shadow_filter = {
            let shadow = image_filters::drop_shadow_only(
                (2.0, 2.0),
                (6.0, 6.0),
                Color::from_argb(128, 0, 0, 0),
                None,
                None,
                None,
            );
            // Inner shadow = clip to bounds + draw inverted shadow
            shadow
        };
        results.push(run_bench(
            surface,
            "inner shadow s=6 (approx)",
            500,
            &|canvas, i| {
                let (x, y) = grid_pos(i);
                let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
                // Draw the base rect
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 240, 240, 240));
                canvas.draw_rect(bounds, &p);
                // Draw the inner shadow clipped
                canvas.save();
                canvas.clip_rect(bounds, None, None);
                let mut lp = Paint::default();
                lp.set_image_filter(inner_shadow_filter.clone());
                let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
                canvas.save_layer(&rec);
                let mut sp = Paint::default();
                sp.set_color(Color::from_argb(255, 240, 240, 240));
                canvas.draw_rect(bounds, &sp);
                canvas.restore();
                canvas.restore();
            },
        ));
    }

    // 14. Backdrop blur (reads from already-drawn content)
    {
        let backdrop_blur = image_filters::blur((8.0, 8.0), None, None, None).unwrap();
        // First draw a background pattern
        results.push(run_bench(
            surface,
            "backdrop blur s=8",
            200,
            &|canvas, i| {
                // The background is whatever was drawn before (the clear + previous rects)
                let col = (i % 20) as f32;
                let row = (i / 20) as f32;
                let x = col * 50.0;
                let y = row * 50.0;
                let bounds = Rect::from_xywh(x, y, 40.0, 40.0);

                // Draw a colored rect as "content behind"
                let mut bg = Paint::default();
                bg.set_color(Color::from_argb(255, 200, 50, (i * 7 % 256) as u8));
                canvas.draw_rect(bounds, &bg);

                // Now the backdrop blur layer on top
                let lp = Paint::default();
                let rec = SaveLayerRec::default()
                    .bounds(&bounds)
                    .backdrop(&backdrop_blur)
                    .paint(&lp);
                canvas.save_layer(&rec);
                // Draw semi-transparent overlay
                let mut overlay = Paint::default();
                overlay.set_color(Color::from_argb(80, 255, 255, 255));
                canvas.draw_rect(bounds, &overlay);
                canvas.restore();
            },
        ));
    }

    // 15. Backdrop blur at larger size
    {
        let backdrop_blur = image_filters::blur((12.0, 12.0), None, None, None).unwrap();
        results.push(run_bench(
            surface,
            "backdrop blur s=12 (100x100)",
            100,
            &|canvas, i| {
                let col = (i % 10) as f32;
                let row = (i / 10) as f32;
                let x = col * 100.0;
                let y = row * 100.0;
                let bounds = Rect::from_xywh(x, y, 100.0, 100.0);
                let mut bg = Paint::default();
                bg.set_color(Color::from_argb(255, 100, 200, 50));
                canvas.draw_rect(bounds, &bg);
                let lp = Paint::default();
                let rec = SaveLayerRec::default()
                    .bounds(&bounds)
                    .backdrop(&backdrop_blur)
                    .paint(&lp);
                canvas.save_layer(&rec);
                let mut overlay = Paint::default();
                overlay.set_color(Color::from_argb(60, 255, 255, 255));
                canvas.draw_rect(bounds, &overlay);
                canvas.restore();
            },
        ));
    }

    // 16. Blend mode (non-SrcOver) via save_layer
    results.push(run_bench(
        surface,
        "blend mode (Multiply, save_layer)",
        1000,
        &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut lp = Paint::default();
            lp.set_blend_mode(skia_safe::BlendMode::Multiply);
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut p = Paint::default();
            p.set_color(Color::from_argb(255, 200, 100, 50));
            canvas.draw_rect(bounds, &p);
            canvas.restore();
        },
    ));

    // 17. Blend mode on paint (no save_layer — single rect)
    results.push(run_bench(
        surface,
        "blend mode (Multiply, on paint)",
        10000,
        &|canvas, i| {
            let (x, y) = grid_pos(i);
            let mut p = Paint::default();
            p.set_color(Color::from_argb(255, 200, 100, 50));
            p.set_blend_mode(skia_safe::BlendMode::Multiply);
            canvas.draw_rect(Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE), &p);
        },
    ));

    // 18. Chained color filters (brightness + contrast + saturate)
    {
        let cf1 = color_filters::matrix_row_major(
            &[
                1.2, 0.0, 0.0, 0.0, 0.0, 0.0, 1.2, 0.0, 0.0, 0.0, 0.0, 0.0, 1.2, 0.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
            ],
            None,
        );
        let cf2 = color_filters::matrix_row_major(
            &[
                1.1, 0.0, 0.0, 0.0, -0.05, 0.0, 1.1, 0.0, 0.0, -0.05, 0.0, 0.0, 1.1, 0.0, -0.05,
                0.0, 0.0, 0.0, 1.0, 0.0,
            ],
            None,
        );
        let chained = cf1.composed(&cf2).unwrap_or(cf1);
        results.push(run_bench(
            surface,
            "chained color filters (2x matrix)",
            10000,
            &|canvas, i| {
                let (x, y) = grid_pos(i);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 100, 150, 200));
                p.set_color_filter(chained.clone());
                canvas.draw_rect(Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE), &p);
            },
        ));
    }

    // 19. Rect with stroke (outline)
    results.push(run_bench(
        surface,
        "rect + stroke (2px)",
        10000,
        &|canvas, i| {
            let (x, y) = grid_pos(i);
            let mut p = Paint::default();
            p.set_color(Color::BLACK);
            p.set_style(skia_safe::PaintStyle::Stroke);
            p.set_stroke_width(2.0);
            p.set_anti_alias(true);
            canvas.draw_rect(Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE), &p);
        },
    ));

    // 20. Rect with fill + stroke (common pattern)
    results.push(run_bench(
        surface,
        "rect fill + stroke",
        10000,
        &|canvas, i| {
            let (x, y) = grid_pos(i);
            let rect = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut fp = Paint::default();
            fp.set_color(Color::from_argb(255, 200, 200, 200));
            canvas.draw_rect(rect, &fp);
            let mut sp = Paint::default();
            sp.set_color(Color::BLACK);
            sp.set_style(skia_safe::PaintStyle::Stroke);
            sp.set_stroke_width(1.0);
            canvas.draw_rect(rect, &sp);
        },
    ));

    // Opacity proof moved to skia_bench/opacity.rs (skia_bench_opacity)

    // ── Print results ───────────────────────────────────────────────

    println!("\n{}", "=".repeat(90));
    println!(
        "EFFECT COST BENCHMARK — {} warmup, {} iterations",
        WARMUP, ITERS
    );
    println!("{}", "=".repeat(90));
    println!(
        "{:<40} {:>6} {:>12} {:>12} {:>8}",
        "Effect", "Count", "Frame (us)", "Per-rect", "vs base"
    );
    println!("{}", "-".repeat(90));

    // Use the 10K baseline for comparison
    let baseline_per_rect = results
        .iter()
        .find(|r| r.name == "baseline (black rect)" && r.count == 10000)
        .map(|r| r.per_rect_us)
        .unwrap_or(1.0);

    // Sort by per-rect cost descending (most expensive first)
    results.sort_by(|a, b| b.per_rect_us.partial_cmp(&a.per_rect_us).unwrap());

    for r in &results {
        let ratio = r.per_rect_us / baseline_per_rect;
        println!(
            "{:<40} {:>6} {:>10.0}us {:>9.1}us {:>6.1}x",
            r.name, r.count, r.avg_frame_us, r.per_rect_us, ratio,
        );
    }

    println!("{}", "-".repeat(90));
    println!(
        "baseline: {:.2} us/rect ({} rects)",
        baseline_per_rect, 10000
    );
    println!();
}
