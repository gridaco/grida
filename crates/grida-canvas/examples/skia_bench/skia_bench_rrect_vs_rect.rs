//! Skia RRect vs Rect — device-space cost measurement.
//!
//! Question: does `drawRRect(r)` cost more than `drawRect` on GPU, and
//! does that cost remain present at tiny (sub-pixel) device radii?
//!
//! This directly answers whether a zoom-aware LOD policy that collapses
//! `rrect → rect` when `radius · camera_zoom < 0.5 px` would be
//! complementary to Skia's internal behavior or redundant.
//!
//! Skia's own auto-collapse (`SkRRect::isRect()`) only triggers on
//! EXACTLY-zero radii. Our theory: non-zero sub-pixel radii still take
//! the rrect shader path. This bench verifies that claim.
//!
//! ```bash
//! cargo run -p cg --example skia_bench_rrect_vs_rect --features native-gl-context --release
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
fn main() {
    let mut gpu = HeadlessGpu::new(1000, 1000).expect("GPU init");
    gpu.print_gl_info();
    println!();

    let surface = &mut gpu.surface;
    let n_iter = 300;

    println!("=== Rect vs RRect — device-space cost ===");
    println!("5000 shapes/frame, non-overlapping 100×50 grid.");
    println!("Each shape is 8×8 device px. All coordinates device-space.");
    println!("Corner radius varied from 0 → 4 px.");
    println!();

    let count = 5000usize;

    // Warmup (compile shaders, prime GPU)
    for _ in 0..30 {
        flush_gpu(surface);
        bench_rects_device(surface, count, 1);
        bench_rrects_device(surface, count, 1.0, 1);
        flush_gpu(surface);
    }

    // Baseline: drawRect
    let rect_us = bench_rects_device(surface, count, n_iter);
    println!(
        "  drawRect (baseline):        {:>8} us  | {:.3} us/shape",
        rect_us,
        rect_us as f64 / count as f64
    );
    println!();

    println!(
        "{:>12} {:>12} {:>12} {:>12} {:>14}",
        "radius(dev-px)", "us/frame", "us/shape", "Δ vs rect", "rrect/rect"
    );
    println!("{}", "─".repeat(76));

    // Sub-pixel radii
    for &radius in &[0.0_f32, 0.05, 0.1, 0.25, 0.49] {
        let us = bench_rrects_device(surface, count, radius, n_iter);
        let delta = us as i64 - rect_us as i64;
        let ratio = us as f64 / rect_us as f64;
        let note = if radius == 0.0 {
            " (r=0 auto-fast-path)"
        } else {
            " ← subpixel"
        };
        println!(
            "{:>14.3} {:>12} {:>12.3} {:>+12} {:>13.2}x{}",
            radius,
            us,
            us as f64 / count as f64,
            delta,
            ratio,
            note
        );
    }

    println!();
    // Near-pixel radii (rrect shader engaged)
    for &radius in &[0.5, 1.0, 2.0, 4.0, 8.0] {
        let us = bench_rrects_device(surface, count, radius, n_iter);
        let delta = us as i64 - rect_us as i64;
        let ratio = us as f64 / rect_us as f64;
        println!(
            "{:>14.3} {:>12} {:>12.3} {:>+12} {:>13.2}x",
            radius,
            us,
            us as f64 / count as f64,
            delta,
            ratio
        );
    }

    println!();

    // Repeat with larger 32x32 shapes to see if shape size changes the pattern
    println!("=== Larger 32×32 shapes (different GPU path?) ===");
    let rect_us32 = bench_rects_device_sized(surface, count, 32.0, n_iter);
    println!("  drawRect(32×32):           {:>8} us", rect_us32);
    for &radius in &[0.0_f32, 0.25, 0.5, 1.0, 4.0, 16.0] {
        let us = bench_rrects_device_sized(surface, count, 32.0, radius, n_iter);
        let delta = us as i64 - rect_us32 as i64;
        let ratio = us as f64 / rect_us32 as f64;
        println!(
            "  drawRRect(32×32, r={:>5.2}):{:>8} us  Δ={:>+6} ({:.2}x)",
            radius, us, delta, ratio
        );
    }
    println!();

    // === Part 2: Application-level projected-radius scenario ===
    println!("=== Application-level projected-radius scenario ===");
    println!("World radius=4.0, scale varies. Projected radius = 4·scale.");
    println!("Measures what happens when an app DOES NOT collapse rrect→rect:");
    println!();
    println!(
        "{:>8} {:>14} {:>12} {:>12}",
        "scale", "projected r (px)", "rrect(us)", "rect(us)"
    );
    println!("{}", "─".repeat(52));
    for &scale in &[1.0_f32, 0.5, 0.25, 0.1, 0.05, 0.02] {
        let rrect_us = bench_rrects_scaled(surface, count, scale, 4.0, n_iter);
        let rect_us = bench_rects_scaled(surface, count, scale, n_iter);
        println!(
            "{:>8.3} {:>14.3} {:>12} {:>12}",
            scale,
            4.0 * scale,
            rrect_us,
            rect_us
        );
    }
    println!();

    // === Part 3: Path-wrapped rrect (sanity check) ===
    println!("=== Skia auto-collapse verification ===");
    let rrect_zero = bench_rrects_device(surface, count, 0.0, n_iter);
    let rect = bench_rects_device(surface, count, n_iter);
    println!("  drawRect:           {:>6} us", rect);
    println!(
        "  drawRRect(r=0):     {:>6} us  (SkRRect::isRect() == true)",
        rrect_zero
    );
    println!(
        "  overhead at r=0:    {:>+6} us  ← fast-path kicks in",
        rrect_zero as i64 - rect as i64
    );
    println!();
    println!("This is the ONLY zoom-independent collapse Skia does.");
    println!("At r=0.01 (still near-zero but not exactly 0), the rrect shader runs:");
    let rrect_tiny = bench_rrects_device(surface, count, 0.01, n_iter);
    println!(
        "  drawRRect(r=0.01):  {:>6} us  ← dispatches rrect shader!",
        rrect_tiny
    );
    println!(
        "  Δ vs r=0:           {:>+6} us  = cost of invoking rrect pipeline for invisible radius",
        rrect_tiny as i64 - rrect_zero as i64
    );
}

#[cfg(feature = "native-gl-context")]
fn bench_rects_device(surface: &mut skia_safe::Surface, count: usize, n_iter: usize) -> u128 {
    flush_gpu(surface);
    let start = Instant::now();
    for _ in 0..n_iter {
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        let mut paint = skia_safe::Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(255, 100, 150, 200));
        for i in 0..count {
            let x = (i % 100) as f32 * 10.0;
            let y = (i / 100) as f32 * 10.0;
            canvas.draw_rect(skia_safe::Rect::from_xywh(x, y, 8.0, 8.0), &paint);
        }
        flush_gpu(surface);
    }
    (start.elapsed() / n_iter as u32).as_micros()
}

#[cfg(feature = "native-gl-context")]
fn bench_rrects_device(
    surface: &mut skia_safe::Surface,
    count: usize,
    radius: f32,
    n_iter: usize,
) -> u128 {
    flush_gpu(surface);
    let start = Instant::now();
    for _ in 0..n_iter {
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        let mut paint = skia_safe::Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(255, 100, 150, 200));
        for i in 0..count {
            let x = (i % 100) as f32 * 10.0;
            let y = (i / 100) as f32 * 10.0;
            let r = skia_safe::Rect::from_xywh(x, y, 8.0, 8.0);
            let rrect = skia_safe::RRect::new_rect_xy(r, radius, radius);
            canvas.draw_rrect(rrect, &paint);
        }
        flush_gpu(surface);
    }
    (start.elapsed() / n_iter as u32).as_micros()
}

#[cfg(feature = "native-gl-context")]
fn bench_rects_device_sized(
    surface: &mut skia_safe::Surface,
    count: usize,
    size: f32,
    n_iter: usize,
) -> u128 {
    flush_gpu(surface);
    let start = Instant::now();
    let step = (size + 2.0).max(10.0);
    for _ in 0..n_iter {
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        let mut paint = skia_safe::Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(255, 100, 150, 200));
        let cols = (1000.0 / step) as usize;
        for i in 0..count {
            let x = (i % cols) as f32 * step;
            let y = (i / cols) as f32 * step;
            canvas.draw_rect(skia_safe::Rect::from_xywh(x, y, size, size), &paint);
        }
        flush_gpu(surface);
    }
    (start.elapsed() / n_iter as u32).as_micros()
}

#[cfg(feature = "native-gl-context")]
fn bench_rrects_device_sized(
    surface: &mut skia_safe::Surface,
    count: usize,
    size: f32,
    radius: f32,
    n_iter: usize,
) -> u128 {
    flush_gpu(surface);
    let start = Instant::now();
    let step = (size + 2.0).max(10.0);
    for _ in 0..n_iter {
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        let mut paint = skia_safe::Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(255, 100, 150, 200));
        let cols = (1000.0 / step) as usize;
        for i in 0..count {
            let x = (i % cols) as f32 * step;
            let y = (i / cols) as f32 * step;
            let r = skia_safe::Rect::from_xywh(x, y, size, size);
            let rrect = skia_safe::RRect::new_rect_xy(r, radius, radius);
            canvas.draw_rrect(rrect, &paint);
        }
        flush_gpu(surface);
    }
    (start.elapsed() / n_iter as u32).as_micros()
}

#[cfg(feature = "native-gl-context")]
fn bench_rrects_scaled(
    surface: &mut skia_safe::Surface,
    count: usize,
    scale: f32,
    world_radius: f32,
    n_iter: usize,
) -> u128 {
    // Keep shapes non-overlapping at every scale: step in world-space = 10/scale
    let step = 10.0 / scale;
    let size = 8.0 / scale;
    flush_gpu(surface);
    let start = Instant::now();
    for _ in 0..n_iter {
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        canvas.save();
        canvas.scale((scale, scale));
        let mut paint = skia_safe::Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(255, 100, 150, 200));
        for i in 0..count {
            let x = (i % 100) as f32 * step;
            let y = (i / 100) as f32 * step;
            let r = skia_safe::Rect::from_xywh(x, y, size, size);
            let rrect = skia_safe::RRect::new_rect_xy(r, world_radius, world_radius);
            canvas.draw_rrect(rrect, &paint);
        }
        canvas.restore();
        flush_gpu(surface);
    }
    (start.elapsed() / n_iter as u32).as_micros()
}

#[cfg(feature = "native-gl-context")]
fn bench_rects_scaled(
    surface: &mut skia_safe::Surface,
    count: usize,
    scale: f32,
    n_iter: usize,
) -> u128 {
    let step = 10.0 / scale;
    let size = 8.0 / scale;
    flush_gpu(surface);
    let start = Instant::now();
    for _ in 0..n_iter {
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        canvas.save();
        canvas.scale((scale, scale));
        let mut paint = skia_safe::Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(255, 100, 150, 200));
        for i in 0..count {
            let x = (i % 100) as f32 * step;
            let y = (i / 100) as f32 * step;
            canvas.draw_rect(skia_safe::Rect::from_xywh(x, y, size, size), &paint);
        }
        canvas.restore();
        flush_gpu(surface);
    }
    (start.elapsed() / n_iter as u32).as_micros()
}
