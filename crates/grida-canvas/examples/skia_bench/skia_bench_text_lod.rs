//! Skia Text LOD — paragraph-paint vs greek-rect cost comparison.
//!
//! Measures whether replacing a paragraph paint with a single drawRect
//! ("greeking") is worth doing at low zoom.
//!
//! Scenario: N text nodes on a GPU surface. For each configuration, we
//! pre-shape a paragraph once (mirroring ParagraphCache behaviour), then
//! measure the per-frame cost of:
//!   - `paragraph.paint()`  — current path
//!   - `drawRect`            — greeking candidate
//!   - `skip`                — cull candidate
//!
//! The test varies:
//!   - font size (in device pixels after projection)
//!   - number of glyphs per paragraph
//!   - number of paragraphs per frame
//!
//! ```bash
//! cargo run -p cg --example skia_bench_text_lod --features native-gl-context --release
//! ```

#[cfg(feature = "native-gl-context")]
use cg::window::headless::HeadlessGpu;
use std::time::Instant;

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("This example requires --features native-gl-context");
}

#[cfg(feature = "native-gl-context")]
fn flush_gpu(surface: &mut skia_safe::Surface) {
    if let Some(mut ctx) = surface.recording_context() {
        if let Some(mut direct) = ctx.as_direct_context() {
            direct.flush_and_submit();
        }
    }
}

#[cfg(feature = "native-gl-context")]
fn make_font_collection() -> skia_safe::textlayout::FontCollection {
    use skia_safe::FontMgr;
    let mut fc = skia_safe::textlayout::FontCollection::new();
    fc.set_default_font_manager(FontMgr::new(), None);
    fc
}

#[cfg(feature = "native-gl-context")]
fn build_paragraph(
    fc: &skia_safe::textlayout::FontCollection,
    text: &str,
    font_size: f32,
    max_width: f32,
) -> skia_safe::textlayout::Paragraph {
    use skia_safe::textlayout;
    let mut ps = textlayout::ParagraphStyle::new();
    let mut ts = textlayout::TextStyle::new();
    ts.set_font_size(font_size);
    ts.set_color(skia_safe::Color::BLACK);
    ps.set_text_style(&ts);
    let mut builder = textlayout::ParagraphBuilder::new(&ps, fc);
    builder.add_text(text);
    let mut para = builder.build();
    para.layout(max_width);
    para
}

#[cfg(feature = "native-gl-context")]
fn main() {
    let mut gpu = HeadlessGpu::new(1000, 1000).expect("GPU init");
    gpu.print_gl_info();
    println!();

    let surface = &mut gpu.surface;
    let fc = make_font_collection();
    let n_iter = 200;

    // Pre-shape paragraphs at each test font size. In real use the engine
    // caches these in ParagraphCache, so re-shaping cost is NOT part of
    // the per-frame measurement.
    let sample_text = "The quick brown fox jumps over the lazy dog";

    println!("=== Text paragraph.paint() vs drawRect vs skip ===");
    println!("Each test: 1000 paragraphs per frame, grid-positioned, non-overlapping.");
    println!("Paragraphs pre-shaped (paint-only cost measured).");
    println!();

    let count = 1000usize;
    let font_sizes: &[f32] = &[0.25, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 12.0, 16.0, 24.0, 48.0];

    // Warmup: run a big paragraph paint to compile shaders + prime atlas
    {
        let para = build_paragraph(&fc, sample_text, 16.0, 300.0);
        for _ in 0..20 {
            let canvas = surface.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            para.paint(canvas, (10.0, 10.0));
            flush_gpu(surface);
        }
    }

    println!(
        "{:>10} {:>12} {:>12} {:>12} {:>12} {:>10}",
        "font(px)", "paint(us)", "rect(us)", "skip(us)", "paint/rect", "per-node"
    );
    println!("{}", "─".repeat(78));

    for &font_size in font_sizes {
        // Build paragraph once per font size — pre-shaped so paint() is measured.
        let para = build_paragraph(&fc, sample_text, font_size, 300.0);
        let para_h = para.height();
        let para_w = para.max_width();

        // Test 1: N × paragraph.paint()
        flush_gpu(surface);
        let start = Instant::now();
        for _ in 0..n_iter {
            let canvas = surface.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            for i in 0..count {
                let x = (i % 40) as f32 * 20.0;
                let y = (i / 40) as f32 * 20.0;
                para.paint(canvas, (x, y));
            }
            flush_gpu(surface);
        }
        let paint_us = (start.elapsed() / n_iter as u32).as_micros();

        // Test 2: N × drawRect (greek)
        let mut paint_obj = skia_safe::Paint::default();
        paint_obj.set_color(skia_safe::Color::from_argb(180, 80, 80, 80));
        paint_obj.set_anti_alias(false); // greeking doesn't need AA
        flush_gpu(surface);
        let start = Instant::now();
        for _ in 0..n_iter {
            let canvas = surface.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            for i in 0..count {
                let x = (i % 40) as f32 * 20.0;
                let y = (i / 40) as f32 * 20.0;
                canvas.draw_rect(skia_safe::Rect::from_xywh(x, y, para_w, para_h), &paint_obj);
            }
            flush_gpu(surface);
        }
        let rect_us = (start.elapsed() / n_iter as u32).as_micros();

        // Test 3: skip (just clear, measure clear overhead alone)
        flush_gpu(surface);
        let start = Instant::now();
        for _ in 0..n_iter {
            let canvas = surface.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            flush_gpu(surface);
        }
        let skip_us = (start.elapsed() / n_iter as u32).as_micros();

        let paint_net = paint_us as i64 - skip_us as i64;
        let rect_net = rect_us as i64 - skip_us as i64;
        let ratio = paint_net.max(0) as f64 / rect_net.max(1) as f64;
        let per_node_us = paint_net as f64 / count as f64;

        println!(
            "{:>10.2} {:>12} {:>12} {:>12} {:>12.2} {:>8.3}µs",
            font_size, paint_us, rect_us, skip_us, ratio, per_node_us
        );
    }

    println!();
    println!("Notes:");
    println!("- paint(us)  = clear + 1000 × paragraph.paint() + flush");
    println!("- rect(us)   = clear + 1000 × drawRect           + flush");
    println!("- skip(us)   = clear + flush (baseline overhead)");
    println!("- per-node   = (paint - skip) / 1000             (per-node text cost)");
    println!("- paint/rect = how much cheaper greeking is (higher = bigger win)");
}
