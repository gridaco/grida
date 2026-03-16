//! Skia GPU Primitive Microbenchmark
//!
//! Measures individual Skia operations in isolation on a GPU surface to
//! identify the true cost of each compositing strategy.
//!
//! ```bash
//! cargo run -p cg --example skia_bench_primitives --features native-gl-context --release
//! ```

#[cfg(feature = "native-gl-context")]
use cg::window::headless::HeadlessGpu;
use std::time::Instant;

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("This example requires --features native-gl-context");
}

#[cfg(feature = "native-gl-context")]
fn main() {
    let mut gpu = HeadlessGpu::new(1000, 1000).expect("GPU init");
    gpu.print_gl_info();
    println!();

    let surface = &mut gpu.surface;
    let n_iter = 500;

    // ─── Test 1: Raw rect fills ──────────────────────────────────────
    // How fast can the GPU fill N rects per frame?
    for &count in &[100, 500, 1000, 2000, 5000, 10000] {
        flush_gpu(surface);
        let start = Instant::now();
        for _ in 0..n_iter {
            let canvas = surface.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            for i in 0..count {
                let x = (i % 100) as f32 * 10.0;
                let y = (i / 100) as f32 * 10.0;
                let mut paint = skia_safe::Paint::default();
                paint.set_color(skia_safe::Color::from_argb(255, (i * 7 % 256) as u8, 100, 200));
                canvas.draw_rect(skia_safe::Rect::from_xywh(x, y, 8.0, 8.0), &paint);
            }
            flush_gpu(surface);
        }
        let avg = start.elapsed() / n_iter;
        println!(
            "rect_fill x{:<6} | avg {:>7} us  ({:.0} fps)  {:.2} us/rect",
            count, avg.as_micros(), 1_000_000.0 / avg.as_micros() as f64, avg.as_micros() as f64 / count as f64,
        );
    }

    println!();

    // ─── Test 2: Rect with drop shadow (via save_layer + image_filter) ───
    // This is how Skia actually renders shadows — with an image filter on save_layer.
    {
        let shadow_filter_4 = skia_safe::image_filters::drop_shadow_only(
            (4.0, 4.0), (8.0, 8.0),
            skia_safe::Color::from_argb(80, 0, 0, 0),
            None, None, None,
        );
        // Capture into a GPU texture.
        let info = skia_safe::ImageInfo::new_n32_premul((32, 32), None);
        let mut offscreen = surface.new_surface(&info).expect("offscreen");
        {
            let c = offscreen.canvas();
            c.clear(skia_safe::Color::TRANSPARENT);
            let bounds = skia_safe::Rect::from_xywh(0.0, 0.0, 32.0, 32.0);
            let mut lp = skia_safe::Paint::default();
            lp.set_image_filter(shadow_filter_4.clone());
            let rec = skia_safe::canvas::SaveLayerRec::default().bounds(&bounds).paint(&lp);
            c.save_layer(&rec);
            let mut p = skia_safe::Paint::default();
            p.set_color(skia_safe::Color::from_argb(255, 180, 180, 180));
            c.draw_rect(skia_safe::Rect::from_xywh(0.0, 0.0, 8.0, 8.0), &p);
            c.restore();
        }
        let cached_img = offscreen.image_snapshot();
        flush_gpu(surface);

        for &count in &[10, 50, 100, 500, 1000, 2000] {
            flush_gpu(surface);
            let start = Instant::now();
            for _ in 0..n_iter {
                let canvas = surface.canvas();
                canvas.clear(skia_safe::Color::WHITE);
                let src = skia_safe::Rect::from_wh(32.0, 32.0);
                let paint = skia_safe::Paint::default();
                for i in 0..count {
                    let x = (i % 100) as f32 * 10.0;
                    let y = (i / 100) as f32 * 10.0;
                    let dst = skia_safe::Rect::from_xywh(x, y, 32.0, 32.0);
                    canvas.draw_image_rect(
                        &cached_img,
                        Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                        dst,
                        &paint,
                    );
                }
                flush_gpu(surface);
            }
            let avg = start.elapsed() / n_iter;
            println!(
                "img_blit  x{:<6} | avg {:>7} us  ({:.0} fps)  {:.1} us/node",
                count, avg.as_micros(), 1_000_000.0 / avg.as_micros() as f64, avg.as_micros() as f64 / count as f64,
            );
        }

        println!();

        // ─── Test 4b: Same image blitted N times (same texture, GPU should batch) ───
        // vs N different images (N textures, GPU must switch)
        let n_textures = 100;
        let mut textures: Vec<skia_safe::Image> = Vec::with_capacity(n_textures);
        for i in 0..n_textures {
            let mut off = surface.new_surface(&info).expect("offscreen");
            {
                let c = off.canvas();
                c.clear(skia_safe::Color::TRANSPARENT);
                let mut p = skia_safe::Paint::default();
                p.set_color(skia_safe::Color::from_argb(255, (i * 17 % 256) as u8, 100, 200));
                c.draw_rect(skia_safe::Rect::from_xywh(0.0, 0.0, 32.0, 32.0), &p);
            }
            textures.push(off.image_snapshot());
        }
        flush_gpu(surface);

        // Blit 1000 copies of the SAME texture
        {
            flush_gpu(surface);
            let start = Instant::now();
            for _ in 0..n_iter {
                let canvas = surface.canvas();
                canvas.clear(skia_safe::Color::WHITE);
                let src = skia_safe::Rect::from_wh(32.0, 32.0);
                let paint = skia_safe::Paint::default();
                for i in 0..1000 {
                    let x = (i % 100) as f32 * 10.0;
                    let y = (i / 100) as f32 * 10.0;
                    let dst = skia_safe::Rect::from_xywh(x, y, 32.0, 32.0);
                    canvas.draw_image_rect(
                        &textures[0],
                        Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                        dst,
                        &paint,
                    );
                }
                flush_gpu(surface);
            }
            let avg = start.elapsed() / n_iter;
            println!(
                "same_tex  x1000   | avg {:>7} us  ({:.0} fps)  {:.1} us/blit",
                avg.as_micros(), 1_000_000.0 / avg.as_micros() as f64, avg.as_micros() as f64 / 1000.0,
            );
        }

        // Blit 1000 draws cycling through 100 DIFFERENT textures
        {
            flush_gpu(surface);
            let start = Instant::now();
            for _ in 0..n_iter {
                let canvas = surface.canvas();
                canvas.clear(skia_safe::Color::WHITE);
                let src = skia_safe::Rect::from_wh(32.0, 32.0);
                let paint = skia_safe::Paint::default();
                for i in 0..1000 {
                    let x = (i % 100) as f32 * 10.0;
                    let y = (i / 100) as f32 * 10.0;
                    let dst = skia_safe::Rect::from_xywh(x, y, 32.0, 32.0);
                    canvas.draw_image_rect(
                        &textures[i % n_textures],
                        Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                        dst,
                        &paint,
                    );
                }
                flush_gpu(surface);
            }
            let avg = start.elapsed() / n_iter;
            println!(
                "diff_tex  x1000   | avg {:>7} us  ({:.0} fps)  {:.1} us/blit",
                avg.as_micros(), 1_000_000.0 / avg.as_micros() as f64, avg.as_micros() as f64 / 1000.0,
            );
        }
    }

    println!();

    // ─── Test 5: image_snapshot_with_bounds cost ─────────────────────
    // How expensive is extracting a sub-region from a large GPU surface?
    {
        let info = skia_safe::ImageInfo::new_n32_premul((4096, 4096), None);
        let mut big = surface.new_surface(&info).expect("big surface");
        big.canvas().clear(skia_safe::Color::WHITE);
        flush_gpu(surface);

        for &region_size in &[16, 32, 64, 128, 256] {
            let bounds = skia_safe::IRect::from_wh(region_size, region_size);
            flush_gpu(surface);
            let start = Instant::now();
            for _ in 0..n_iter {
                let _img = big.image_snapshot_with_bounds(bounds);
            }
            flush_gpu(surface);
            let avg = start.elapsed() / n_iter;
            println!(
                "snapshot  {}x{:<5} | avg {:>7} us",
                region_size, region_size, avg.as_micros(),
            );
        }
    }

    println!();

    // ─── Test 6: SkPicture with blur image filter (the expensive part) ──
    // Record a picture that includes a blur filter, measure replay cost.
    {
        let blur_filter = skia_safe::image_filters::blur(
            (8.0, 8.0), None, None::<skia_safe::ImageFilter>, None,
        );
        let mut recorder = skia_safe::PictureRecorder::new();
        let bounds = skia_safe::Rect::from_xywh(0.0, 0.0, 100.0, 100.0);
        let rec_canvas = recorder.begin_recording(bounds, false);
        let mut lp = skia_safe::Paint::default();
        lp.set_image_filter(blur_filter);
        let rec = skia_safe::canvas::SaveLayerRec::default().bounds(&bounds).paint(&lp);
        rec_canvas.save_layer(&rec);
        let mut p = skia_safe::Paint::default();
        p.set_color(skia_safe::Color::RED);
        rec_canvas.draw_rect(skia_safe::Rect::from_xywh(10.0, 10.0, 80.0, 80.0), &p);
        rec_canvas.restore();
        let blur_pic = recorder.finish_recording_as_picture(Some(&bounds)).unwrap();

        for &count in &[10, 50, 100, 500] {
            flush_gpu(surface);
            let start = Instant::now();
            for _ in 0..n_iter {
                let canvas = surface.canvas();
                canvas.clear(skia_safe::Color::WHITE);
                for i in 0..count {
                    let x = (i % 50) as f32 * 20.0;
                    let y = (i / 50) as f32 * 20.0;
                    canvas.save();
                    canvas.translate((x, y));
                    canvas.draw_picture(&blur_pic, None, None);
                    canvas.restore();
                }
                flush_gpu(surface);
            }
            let avg = start.elapsed() / n_iter;
            println!(
                "blur_pic  x{:<6} | avg {:>7} us  ({:.0} fps)  {:.1} us/node",
                count, avg.as_micros(), 1_000_000.0 / avg.as_micros() as f64, avg.as_micros() as f64 / count as f64,
            );
        }
    }

    println!("\nDone.");
}

#[cfg(feature = "native-gl-context")]
fn flush_gpu(surface: &mut skia_safe::Surface) {
    if let Some(mut ctx) = surface.recording_context() {
        if let Some(mut direct) = ctx.as_direct_context() {
            direct.flush_and_submit();
        }
    }
}
