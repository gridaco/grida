//! Skia GPU Sub-Pixel Rendering Cost Benchmark
//!
//! Measures the actual cost of drawing sub-pixel geometry at low zoom.
//! Compares:
//!   A) Drawing N rects at full size (4x4 px each)
//!   B) Drawing N rects at 0.02x zoom (0.08x0.08 px each — sub-pixel)
//!   C) Skipping N rects entirely (baseline dispatch cost = 0)
//!   D) Drawing N rects at full size, AA off
//!   E) Drawing N rects at 0.02x zoom, AA off
//!
//! All use pre-recorded SkPictures (matching the real engine path).
//! GPU is synced after each frame for accurate timing.
//!
//! ```bash
//! cargo run -p cg --example skia_bench_subpixel --features native-gl-context --release
//! ```

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("This example requires --features native-gl-context");
}

#[cfg(feature = "native-gl-context")]
fn main() {
    use cg::window::headless::HeadlessGpu;
    use skia_safe::Color;
    use std::time::Instant;

    let mut gpu = HeadlessGpu::new(1000, 1000).expect("GPU init");
    gpu.print_gl_info();
    println!();

    let surface = &mut gpu.surface;
    let n_iter: u32 = 300;

    for &count in &[1_000, 5_000, 10_000, 40_000] {
        let rect_size = 4.0_f32;
        let cols = 500usize; // spread across a large world

        let pics_aa = record_rect_pictures(count, cols, rect_size, true);
        let pics_noaa = record_rect_pictures(count, cols, rect_size, false);

        flush_gpu(surface);

        // A) Full size, AA on
        let avg_full_aa = bench_pictures(surface, n_iter, &pics_aa, 1.0);

        // B) 0.02x zoom, AA on
        let avg_zoom_aa = bench_pictures(surface, n_iter, &pics_aa, 0.02);

        // C) Skip (draw nothing, just clear + flush)
        let avg_skip = {
            flush_gpu(surface);
            let start = Instant::now();
            for _ in 0..n_iter {
                let canvas = surface.canvas();
                canvas.clear(Color::WHITE);
                flush_gpu(surface);
            }
            start.elapsed() / n_iter
        };

        // D) Full size, AA off
        let avg_full_noaa = bench_pictures(surface, n_iter, &pics_noaa, 1.0);

        // E) 0.02x zoom, AA off
        let avg_zoom_noaa = bench_pictures(surface, n_iter, &pics_noaa, 0.02);

        println!("x{:<6}", count);
        println!(
            "  full  AA on:  {:>7} us | AA off: {:>7} us",
            avg_full_aa.as_micros(),
            avg_full_noaa.as_micros(),
        );
        println!(
            "  0.02x AA on:  {:>7} us | AA off: {:>7} us",
            avg_zoom_aa.as_micros(),
            avg_zoom_noaa.as_micros(),
        );
        println!("  skip (0 draws): {:>5} us", avg_skip.as_micros(),);
        let zoom_vs_skip = avg_zoom_aa.as_micros() as f64 - avg_skip.as_micros() as f64;
        println!(
            "  per-node cost at 0.02x: {:.2} us  (full: {:.2} us)",
            zoom_vs_skip / count as f64,
            (avg_full_aa.as_micros() as f64 - avg_skip.as_micros() as f64) / count as f64,
        );
        println!();
    }
}

#[cfg(feature = "native-gl-context")]
fn record_rect_pictures(
    count: usize,
    cols: usize,
    rect_size: f32,
    aa: bool,
) -> Vec<skia_safe::Picture> {
    use skia_safe::{Color, Paint, PictureRecorder, Rect};
    (0..count)
        .map(|i| {
            let x = (i % cols) as f32 * rect_size;
            let y = (i / cols) as f32 * rect_size;
            let bounds = Rect::from_xywh(x, y, rect_size, rect_size);
            let mut recorder = PictureRecorder::new();
            let canvas = recorder.begin_recording(bounds, false);
            let mut paint = Paint::default();
            paint.set_anti_alias(aa);
            paint.set_color(Color::from_argb(
                255,
                (i * 7 % 256) as u8,
                (i * 13 % 256) as u8,
                100,
            ));
            canvas.draw_rect(bounds, &paint);
            recorder.finish_recording_as_picture(Some(&bounds)).unwrap()
        })
        .collect()
}

#[cfg(feature = "native-gl-context")]
fn bench_pictures(
    surface: &mut skia_safe::Surface,
    n_iter: u32,
    pics: &[skia_safe::Picture],
    zoom: f32,
) -> std::time::Duration {
    use skia_safe::Color;
    use std::time::Instant;

    flush_gpu(surface);
    let start = Instant::now();
    for _ in 0..n_iter {
        let canvas = surface.canvas();
        canvas.clear(Color::WHITE);
        if zoom != 1.0 {
            canvas.save();
            canvas.scale((zoom, zoom));
        }
        for pic in pics {
            canvas.draw_picture(pic, None, None);
        }
        if zoom != 1.0 {
            canvas.restore();
        }
        flush_gpu(surface);
    }
    start.elapsed() / n_iter
}

#[cfg(feature = "native-gl-context")]
fn flush_gpu(surface: &mut skia_safe::Surface) {
    if let Some(mut ctx) = surface.recording_context() {
        if let Some(mut direct) = ctx.as_direct_context() {
            direct.flush_submit_and_sync_cpu();
        }
    }
}
