//! Cache Hit vs. Miss Cost Ratio Benchmark
//!
//! Measures the actual cost ratio between a cache hit (GPU texture blit) and
//! a cache miss (full rasterization). Validates the ~0.1× estimate from
//! `docs/wg/feat-2d/render-cost-prediction.md`.
//!
//! Run with:
//! ```bash
//! cargo run -p cg --example skia_bench_cache_blit --features native-gl-context --release
//! ```

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("This example requires --features native-gl-context");
}

#[cfg(feature = "native-gl-context")]
fn main() {
    use cg::window::headless::HeadlessGpu;
    use skia_safe::{
        canvas::SaveLayerRec, image_filters, Color, Image, ImageInfo, Paint, Rect, Surface,
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

    /// Measure median time (µs) for a drawing operation.
    fn bench_draw(surface: &mut Surface, draw_fn: &dyn Fn(&skia_safe::Canvas)) -> f64 {
        // Warmup
        for _ in 0..WARMUP {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            draw_fn(canvas);
            flush(surface);
        }
        // Measure
        let mut timings = Vec::with_capacity(ITERS as usize);
        for _ in 0..ITERS {
            let t0 = Instant::now();
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            draw_fn(canvas);
            flush(surface);
            timings.push(t0.elapsed().as_nanos() as f64 / 1000.0);
        }
        timings.sort_by(|a, b| a.partial_cmp(b).unwrap());
        timings[timings.len() / 2]
    }

    /// Capture a rect with effects into a GPU-resident Image.
    fn capture_to_image(
        surface: &mut Surface,
        size: i32,
        draw_fn: &dyn Fn(&skia_safe::Canvas, Rect),
    ) -> Image {
        let info = ImageInfo::new_n32_premul((size, size), None);
        let mut offscreen = surface.new_surface(&info).expect("offscreen surface");
        {
            let canvas = offscreen.canvas();
            canvas.clear(Color::TRANSPARENT);
            let rect = Rect::from_xywh(0.0, 0.0, size as f32, size as f32);
            draw_fn(canvas, rect);
        }
        flush(surface);
        offscreen.image_snapshot()
    }

    // ── Effect configurations ───────────────────────────────────────

    struct EffectConfig {
        name: &'static str,
        draw: Box<dyn Fn(&skia_safe::Canvas, Rect)>,
    }

    let shadow_filter = image_filters::drop_shadow(
        (4.0, 4.0),
        (8.0, 8.0),
        Color::from_argb(128, 0, 0, 0),
        None,
        None,
        None,
    );
    let blur_filter = image_filters::blur((8.0, 8.0), None, None, None);

    let sf = shadow_filter.clone();
    let blf = blur_filter.clone();
    let sf2 = shadow_filter.clone();

    let effects: Vec<EffectConfig> = vec![
        EffectConfig {
            name: "solid rect",
            draw: Box::new(|canvas, rect| {
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
            }),
        },
        EffectConfig {
            name: "rect + blur (s=8)",
            draw: Box::new(move |canvas, rect| {
                let mut lp = Paint::default();
                lp.set_image_filter(blf.clone());
                let rec = SaveLayerRec::default().bounds(&rect).paint(&lp);
                canvas.save_layer(&rec);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
            }),
        },
        EffectConfig {
            name: "rect + shadow (s=8)",
            draw: Box::new(move |canvas, rect| {
                let mut lp = Paint::default();
                lp.set_image_filter(sf.clone());
                let rec = SaveLayerRec::default().bounds(&rect).paint(&lp);
                canvas.save_layer(&rec);
                let mut p = Paint::default();
                p.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p);
                canvas.restore();
            }),
        },
        EffectConfig {
            name: "complex (3 fills + stroke + shadow)",
            draw: Box::new(move |canvas, rect| {
                let mut lp = Paint::default();
                lp.set_image_filter(sf2.clone());
                let rec = SaveLayerRec::default().bounds(&rect).paint(&lp);
                canvas.save_layer(&rec);
                // 3 fills
                let mut p1 = Paint::default();
                p1.set_color(Color::from_argb(255, 66, 133, 244));
                canvas.draw_rect(rect, &p1);
                let mut p2 = Paint::default();
                p2.set_color(Color::from_argb(128, 255, 0, 0));
                canvas.draw_rect(rect, &p2);
                let mut p3 = Paint::default();
                p3.set_color(Color::from_argb(64, 0, 255, 0));
                canvas.draw_rect(rect, &p3);
                // 1 stroke
                let mut s = Paint::default();
                s.set_color(Color::BLACK);
                s.set_style(skia_safe::PaintStyle::Stroke);
                s.set_stroke_width(2.0);
                canvas.draw_rect(rect, &s);
                canvas.restore();
            }),
        },
    ];

    let sizes: [i32; 3] = [100, 200, 500];

    // ── Run benchmarks ──────────────────────────────────────────────

    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 1: Cache Hit vs. Miss Ratio");
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!(
        "  {:<36} {:>5} {:>10} {:>10} {:>10}",
        "Effect", "Size", "Miss(µs)", "Hit(µs)", "Ratio"
    );
    println!(
        "  {:-<36} {:->5} {:->10} {:->10} {:->10}",
        "", "", "", "", ""
    );

    // blit_times[effect_idx][size_idx] for constancy check
    let mut blit_times: Vec<Vec<f64>> = vec![Vec::new(); effects.len()];

    for (ei, effect) in effects.iter().enumerate() {
        for (si, &size) in sizes.iter().enumerate() {
            let sizef = size as f32;
            let cx = (W as f32 - sizef) / 2.0;
            let cy = (H as f32 - sizef) / 2.0;
            let dst_rect = Rect::from_xywh(cx, cy, sizef, sizef);

            // Cache miss: full rasterize
            let miss_us = bench_draw(surface, &|canvas| {
                (effect.draw)(canvas, dst_rect);
            });

            // Capture to GPU texture
            let cached_image = capture_to_image(surface, size, &*effect.draw);

            // Cache hit: texture blit
            let hit_us = bench_draw(surface, &|canvas| {
                canvas.draw_image_rect(&cached_image, None, dst_rect, &Paint::default());
            });

            let ratio = hit_us / miss_us;
            blit_times[ei].push(hit_us);

            println!(
                "  {:<36} {:>4}² {:>10.1} {:>10.1} {:>9.3}×",
                effect.name, size, miss_us, hit_us, ratio
            );

            eprint!(
                "\r  [{}/{}]",
                ei * sizes.len() + si + 1,
                effects.len() * sizes.len()
            );
        }
    }
    eprintln!("\r  Done.{:40}", "");

    // ── Output Section 2: Blit Constancy ────────────────────────────

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 2: Blit Cost Constancy (same size, different source complexity)");
    println!("═══════════════════════════════════════════════════════════════════════════");
    println!("  Blit cost should NOT vary with source effect complexity at the same size.");
    println!();

    for (si, &size) in sizes.iter().enumerate() {
        let blit_at_size: Vec<f64> = blit_times.iter().map(|bt| bt[si]).collect();
        let mean = blit_at_size.iter().sum::<f64>() / blit_at_size.len() as f64;
        let variance = blit_at_size.iter().map(|v| (v - mean).powi(2)).sum::<f64>()
            / blit_at_size.len() as f64;
        let stddev = variance.sqrt();
        let cv = if mean > 0.0 {
            stddev / mean * 100.0
        } else {
            0.0
        };

        println!("  Size {}²:", size);
        for (ei, effect) in effects.iter().enumerate() {
            println!("    {:<36} {:>8.1} µs", effect.name, blit_times[ei][si]);
        }
        println!(
            "    mean={:.1} µs  stddev={:.1} µs  CV={:.1}%  {}",
            mean,
            stddev,
            cv,
            if cv < 10.0 { "OK" } else { "WARN (>10%)" }
        );
        println!();
    }

    println!("  Expected: CV < 10% at each size (blit cost independent of source complexity)");
    println!("  Reference: predicted cache-hit ratio ~0.1× (from cost model doc)");
    println!();
}
