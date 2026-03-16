//! Opacity Benchmark: save_layer vs per-paint alpha
//!
//! Proves that applying opacity via per-paint alpha (baking alpha into each
//! fill/stroke paint) is 15-200x faster than wrapping draws in a save_layer.
//!
//! # The two approaches
//!
//! A) **save_layer** (correct): `save_layer(alpha=128)` → draw fills/strokes
//!    at full opacity → `restore`. The entire node is flattened into an
//!    offscreen texture, then alpha-blended as one unit. Handles overlapping
//!    fills correctly (no double-blend at overlap).
//!
//! B) **per-paint alpha** (fast): each fill/stroke gets the node opacity
//!    baked into its paint color. No offscreen texture. Incorrect where
//!    fills/strokes overlap (double-blend at overlap regions), but visually
//!    identical for non-overlapping content — which is the common case.
//!
//! # Last observed results (Apple M2 Pro, Metal 4.1, 1000x1000, --release)
//!
//! ## Summary @ 1000 nodes
//!
//! ```text
//! Node complexity              SL frame     SL fps   PP frame     PP fps  speedup
//! ----------------------------------------------------------------------------------------
//! 1 fill                        58611us       17      383us     2610    153x
//! fill + stroke                 58743us       17     1501us      666     39x
//! 2 fills + stroke              59430us       17     1734us      577     34x
//! 3 fills + 2 strokes           60569us       17     4051us      247     15x
//! rrect fill+stroke (AA)        60079us       17     1009us      991     60x
//! ```
//!
//! ## Frame time savings @ 1000 nodes
//!
//! ```text
//! Node complexity                  SL total     PP total        saved
//! --------------------------------------------------------------------
//! 1 fill                             58.6ms        0.4ms       58.2ms
//! fill + stroke                      58.7ms        1.5ms       57.2ms
//! 2 fills + stroke                   59.4ms        1.7ms       57.7ms
//! 3 fills + 2 strokes                60.6ms        4.1ms       56.5ms
//! rrect fill+stroke (AA)             60.1ms        1.0ms       59.1ms
//! ```
//!
//! ## Scaling behavior (fill + stroke)
//!
//! ```text
//! Nodes   SL frame     PP frame    SL/node    PP/node   speedup
//!   100    5668us        165us     56.7us      1.7us      34x
//!   500   28551us        794us     57.1us      1.6us      36x
//!  1000   58743us       1501us     58.7us      1.5us      39x
//!  2000  142609us       2897us     71.3us      1.4us      49x
//!  5000  675624us       7260us    135.1us      1.5us      93x
//! ```
//!
//! ## Key findings
//!
//! - save_layer has a fixed ~57-60 us/node cost regardless of content complexity
//! - per-paint alpha scales linearly with draw calls, starting near zero
//! - even worst case (5 draws/node) per-paint is 15x faster
//! - speedup grows super-linearly at high counts (save_layer degrades from
//!   FBO pool pressure: 57 us → 135 us at 5000 nodes)
//! - 1000 rrect fill+stroke: save_layer = 17 fps, per-paint = 991 fps
//! - at 1000 nodes, per-paint saves 57-59 ms/frame — enough to go from
//!   17 fps to 60+ fps
//!
//! # Run
//!
//! ```bash
//! cargo run -p cg --example skia_bench_opacity --features native-gl-context --release
//! ```

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("This example requires --features native-gl-context");
}

#[cfg(feature = "native-gl-context")]
fn main() {
    use cg::window::headless::HeadlessGpu;
    use skia_safe::{canvas::SaveLayerRec, Color, Paint, Rect, Surface};
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
        _name: &'static str,
        _count: usize,
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
            _name: name,
            _count: count,
            avg_frame_us: avg_us,
            per_rect_us: per_rect,
        }
    }

    // ── Data types ──────────────────────────────────────────────────

    struct OpacityRow {
        label: String,
        count: usize,
        sl_frame_us: f64,
        pp_frame_us: f64,
        sl_per_node_us: f64,
        pp_per_node_us: f64,
    }

    let mut rows: Vec<OpacityRow> = Vec::new();

    // Node counts to sweep
    let counts_small: &[usize] = &[100, 500, 1000, 2000, 5000];
    let counts_heavy: &[usize] = &[100, 500, 1000, 2000];

    println!("Running benchmarks... (this takes ~2 minutes)\n");

    // ── Case 1: Single fill ──────────────────────────────────────────
    for &count in counts_small {
        let sl = run_bench(surface, "_sl", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut lp = Paint::default();
            lp.set_alpha(128);
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut p = Paint::default();
            p.set_color(Color::from_argb(255, 66, 133, 244));
            canvas.draw_rect(bounds, &p);
            canvas.restore();
        });
        let pp = run_bench(surface, "_pp", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut p = Paint::default();
            p.set_color(Color::from_argb(128, 66, 133, 244));
            canvas.draw_rect(bounds, &p);
        });
        rows.push(OpacityRow {
            label: "1 fill".into(),
            count,
            sl_frame_us: sl.avg_frame_us,
            pp_frame_us: pp.avg_frame_us,
            sl_per_node_us: sl.per_rect_us,
            pp_per_node_us: pp.per_rect_us,
        });
    }

    // ── Case 2: Fill + stroke (most common design-tool node) ─────────
    for &count in counts_small {
        let sl = run_bench(surface, "_sl", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut lp = Paint::default();
            lp.set_alpha(128);
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut fp = Paint::default();
            fp.set_color(Color::from_argb(255, 66, 133, 244));
            canvas.draw_rect(bounds, &fp);
            let mut sp = Paint::default();
            sp.set_color(Color::from_argb(255, 0, 0, 0));
            sp.set_style(skia_safe::PaintStyle::Stroke);
            sp.set_stroke_width(2.0);
            canvas.draw_rect(bounds, &sp);
            canvas.restore();
        });
        let pp = run_bench(surface, "_pp", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut fp = Paint::default();
            fp.set_color(Color::from_argb(128, 66, 133, 244));
            canvas.draw_rect(bounds, &fp);
            let mut sp = Paint::default();
            sp.set_color(Color::from_argb(128, 0, 0, 0));
            sp.set_style(skia_safe::PaintStyle::Stroke);
            sp.set_stroke_width(2.0);
            canvas.draw_rect(bounds, &sp);
        });
        rows.push(OpacityRow {
            label: "fill + stroke".into(),
            count,
            sl_frame_us: sl.avg_frame_us,
            pp_frame_us: pp.avg_frame_us,
            sl_per_node_us: sl.per_rect_us,
            pp_per_node_us: pp.per_rect_us,
        });
    }

    // ── Case 3: 2 fills + stroke ─────────────────────────────────────
    for &count in counts_heavy {
        let sl = run_bench(surface, "_sl", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut lp = Paint::default();
            lp.set_alpha(128);
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut f1 = Paint::default();
            f1.set_color(Color::from_argb(255, 66, 133, 244));
            canvas.draw_rect(bounds, &f1);
            let mut f2 = Paint::default();
            f2.set_color(Color::from_argb(100, 255, 200, 0));
            canvas.draw_rect(bounds, &f2);
            let mut sp = Paint::default();
            sp.set_color(Color::from_argb(255, 0, 0, 0));
            sp.set_style(skia_safe::PaintStyle::Stroke);
            sp.set_stroke_width(2.0);
            canvas.draw_rect(bounds, &sp);
            canvas.restore();
        });
        let pp = run_bench(surface, "_pp", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut f1 = Paint::default();
            f1.set_color(Color::from_argb(128, 66, 133, 244));
            canvas.draw_rect(bounds, &f1);
            let mut f2 = Paint::default();
            f2.set_color(Color::from_argb(50, 255, 200, 0));
            canvas.draw_rect(bounds, &f2);
            let mut sp = Paint::default();
            sp.set_color(Color::from_argb(128, 0, 0, 0));
            sp.set_style(skia_safe::PaintStyle::Stroke);
            sp.set_stroke_width(2.0);
            canvas.draw_rect(bounds, &sp);
        });
        rows.push(OpacityRow {
            label: "2 fills + stroke".into(),
            count,
            sl_frame_us: sl.avg_frame_us,
            pp_frame_us: pp.avg_frame_us,
            sl_per_node_us: sl.per_rect_us,
            pp_per_node_us: pp.per_rect_us,
        });
    }

    // ── Case 4: 3 fills + 2 strokes (complex node) ──────────────────
    for &count in counts_heavy {
        let sl = run_bench(surface, "_sl", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let mut lp = Paint::default();
            lp.set_alpha(128);
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            for c in &[
                Color::from_argb(255, 66, 133, 244),
                Color::from_argb(180, 255, 200, 0),
                Color::from_argb(100, 255, 0, 128),
            ] {
                let mut fp = Paint::default();
                fp.set_color(*c);
                canvas.draw_rect(bounds, &fp);
            }
            for &(w, c) in &[
                (2.0_f32, Color::from_argb(255, 0, 0, 0)),
                (1.0_f32, Color::from_argb(255, 255, 255, 255)),
            ] {
                let mut sp = Paint::default();
                sp.set_color(c);
                sp.set_style(skia_safe::PaintStyle::Stroke);
                sp.set_stroke_width(w);
                canvas.draw_rect(bounds, &sp);
            }
            canvas.restore();
        });
        let pp = run_bench(surface, "_pp", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            for &(r, g, b, a) in &[
                (66u8, 133u8, 244u8, 128u8),
                (255u8, 200u8, 0u8, 90u8),
                (255u8, 0u8, 128u8, 50u8),
            ] {
                let mut fp = Paint::default();
                fp.set_color(Color::from_argb(a, r, g, b));
                canvas.draw_rect(bounds, &fp);
            }
            for &(w, r, g, b, a) in &[
                (2.0_f32, 0u8, 0u8, 0u8, 128u8),
                (1.0_f32, 255u8, 255u8, 255u8, 128u8),
            ] {
                let mut sp = Paint::default();
                sp.set_color(Color::from_argb(a, r, g, b));
                sp.set_style(skia_safe::PaintStyle::Stroke);
                sp.set_stroke_width(w);
                canvas.draw_rect(bounds, &sp);
            }
        });
        rows.push(OpacityRow {
            label: "3 fills + 2 strokes".into(),
            count,
            sl_frame_us: sl.avg_frame_us,
            pp_frame_us: pp.avg_frame_us,
            sl_per_node_us: sl.per_rect_us,
            pp_per_node_us: pp.per_rect_us,
        });
    }

    // ── Case 5: Rounded rect fill + stroke (AA) — design tool standard
    for &count in counts_small {
        let sl = run_bench(surface, "_sl", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let rrect = skia_safe::RRect::new_rect_xy(bounds, 3.0, 3.0);
            let mut lp = Paint::default();
            lp.set_alpha(128);
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut fp = Paint::default();
            fp.set_color(Color::from_argb(255, 66, 133, 244));
            fp.set_anti_alias(true);
            canvas.draw_rrect(rrect, &fp);
            let mut sp = Paint::default();
            sp.set_color(Color::from_argb(255, 30, 30, 30));
            sp.set_style(skia_safe::PaintStyle::Stroke);
            sp.set_stroke_width(2.0);
            sp.set_anti_alias(true);
            canvas.draw_rrect(rrect, &sp);
            canvas.restore();
        });
        let pp = run_bench(surface, "_pp", count, &|canvas, i| {
            let (x, y) = grid_pos(i);
            let bounds = Rect::from_xywh(x, y, RECT_SIZE, RECT_SIZE);
            let rrect = skia_safe::RRect::new_rect_xy(bounds, 3.0, 3.0);
            let mut fp = Paint::default();
            fp.set_color(Color::from_argb(128, 66, 133, 244));
            fp.set_anti_alias(true);
            canvas.draw_rrect(rrect, &fp);
            let mut sp = Paint::default();
            sp.set_color(Color::from_argb(128, 30, 30, 30));
            sp.set_style(skia_safe::PaintStyle::Stroke);
            sp.set_stroke_width(2.0);
            sp.set_anti_alias(true);
            canvas.draw_rrect(rrect, &sp);
        });
        rows.push(OpacityRow {
            label: "rrect fill+stroke (AA)".into(),
            count,
            sl_frame_us: sl.avg_frame_us,
            pp_frame_us: pp.avg_frame_us,
            sl_per_node_us: sl.per_rect_us,
            pp_per_node_us: pp.per_rect_us,
        });
    }

    // ── Case 6: Single fill, large rect (100x100) ───────────────────
    for &count in &[50, 100, 200, 500] {
        let sl = run_bench(surface, "_sl", count, &|canvas, i| {
            let col = (i % 10) as f32;
            let row = (i / 10) as f32;
            let x = col * 100.0;
            let y = row * 100.0;
            let bounds = Rect::from_xywh(x, y, 100.0, 100.0);
            let mut lp = Paint::default();
            lp.set_alpha(128);
            let rec = SaveLayerRec::default().bounds(&bounds).paint(&lp);
            canvas.save_layer(&rec);
            let mut p = Paint::default();
            p.set_color(Color::from_argb(255, 66, 133, 244));
            canvas.draw_rect(bounds, &p);
            canvas.restore();
        });
        let pp = run_bench(surface, "_pp", count, &|canvas, i| {
            let col = (i % 10) as f32;
            let row = (i / 10) as f32;
            let x = col * 100.0;
            let y = row * 100.0;
            let bounds = Rect::from_xywh(x, y, 100.0, 100.0);
            let mut p = Paint::default();
            p.set_color(Color::from_argb(128, 66, 133, 244));
            canvas.draw_rect(bounds, &p);
        });
        rows.push(OpacityRow {
            label: "1 fill (100x100)".into(),
            count,
            sl_frame_us: sl.avg_frame_us,
            pp_frame_us: pp.avg_frame_us,
            sl_per_node_us: sl.per_rect_us,
            pp_per_node_us: pp.per_rect_us,
        });
    }

    // ── Print results ───────────────────────────────────────────────

    println!("{}", "=".repeat(100));
    println!(
        "OPACITY PROOF: save_layer vs per-paint alpha — {} warmup, {} iters",
        WARMUP, ITERS
    );
    println!("{}", "=".repeat(100));

    // Group by label
    let labels: Vec<String> = {
        let mut v = Vec::new();
        for r in &rows {
            if !v.contains(&r.label) {
                v.push(r.label.clone());
            }
        }
        v
    };

    for label in &labels {
        println!("\n  --- {} ---", label);
        println!(
            "  {:>6}  {:>12} {:>12}  {:>12} {:>12}  {:>8}",
            "Nodes", "SL frame", "PP frame", "SL/node", "PP/node", "speedup"
        );
        for r in rows.iter().filter(|r| &r.label == label) {
            let speedup = r.sl_per_node_us / r.pp_per_node_us;
            let sl_fps = 1_000_000.0 / r.sl_frame_us;
            let pp_fps = 1_000_000.0 / r.pp_frame_us;
            println!(
                "  {:>6}  {:>8.0}us {:>3.0}fps {:>8.0}us {:>3.0}fps  {:>8.1}us {:>8.1}us  {:>6.0}x",
                r.count,
                r.sl_frame_us, sl_fps,
                r.pp_frame_us, pp_fps,
                r.sl_per_node_us, r.pp_per_node_us,
                speedup,
            );
        }
    }

    // ── Grand summary: frame time at 1000 nodes ─────────────────────
    println!("\n  --- Summary @ 1000 nodes ---");
    println!(
        "  {:<28} {:>10} {:>10} {:>10} {:>10} {:>8}",
        "Node complexity", "SL frame", "SL fps", "PP frame", "PP fps", "speedup"
    );
    println!("  {}", "-".repeat(88));
    for label in &labels {
        if let Some(r) = rows
            .iter()
            .find(|r| &r.label == label && r.count == 1000)
        {
            let speedup = r.sl_frame_us / r.pp_frame_us;
            println!(
                "  {:<28} {:>8.0}us {:>8.0} {:>8.0}us {:>8.0} {:>6.0}x",
                r.label,
                r.sl_frame_us,
                1_000_000.0 / r.sl_frame_us,
                r.pp_frame_us,
                1_000_000.0 / r.pp_frame_us,
                speedup,
            );
        }
    }
    println!("  {}", "-".repeat(88));

    // ── Total saved frame time ──────────────────────────────────────
    println!("\n  --- Frame time savings @ 1000 nodes ---");
    println!(
        "  {:<28} {:>12} {:>12} {:>12}",
        "Node complexity", "SL total", "PP total", "saved"
    );
    println!("  {}", "-".repeat(68));
    for label in &labels {
        if let Some(r) = rows
            .iter()
            .find(|r| &r.label == label && r.count == 1000)
        {
            let saved = r.sl_frame_us - r.pp_frame_us;
            println!(
                "  {:<28} {:>10.1}ms {:>10.1}ms {:>10.1}ms",
                r.label,
                r.sl_frame_us / 1000.0,
                r.pp_frame_us / 1000.0,
                saved / 1000.0,
            );
        }
    }
    println!("  {}", "-".repeat(68));
    println!();
}
