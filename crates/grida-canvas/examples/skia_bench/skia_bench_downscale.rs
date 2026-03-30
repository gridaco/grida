//! Downscale Hypothesis Microbenchmark
//!
//! Tests whether rendering to a smaller offscreen surface reduces GPU cost
//! for compositor-style blit workloads.
//!
//! The hypothesis: drawing 1000 image blits into a 500×500 surface should be
//! ~4× faster than into a 2000×2000 surface, because the GPU processes
//! fewer pixels per blit.
//!
//! We test:
//!   1. N blits of cached textures at varying target surface sizes
//!   2. Same source textures, same relative positions, only target size changes
//!   3. Total frame time including flush_and_submit (not just CPU-side draw)
//!   4. With and without camera scale (to match the real downscale path)
//!   5. Source texture from atlas (same texture) vs separate textures
//!
//! ```bash
//! cargo run -p cg --example skia_bench_downscale --features native-gl-context --release
//! ```

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("This example requires --features native-gl-context");
}

#[cfg(feature = "native-gl-context")]
fn main() {
    use cg::window::headless::HeadlessGpu;
    use skia_safe::{canvas::SrcRectConstraint, Color, ImageInfo, Paint, Rect, Surface};
    use std::time::Instant;

    let mut gpu = HeadlessGpu::new(2000, 2000).expect("GPU init");
    gpu.print_gl_info();
    println!();

    let warmup = 50;
    let n_iter = 200;

    println!("=== Downscale Hypothesis Microbenchmark ===");
    println!("warmup={warmup}, iterations={n_iter}");
    println!();

    fn flush(surface: &mut Surface) {
        if let Some(mut ctx) = surface.recording_context() {
            if let Some(mut direct) = ctx.as_direct_context() {
                direct.flush_and_submit();
            }
        }
    }

    // ─── Create source textures ──────────────────────────────────────

    let node_count = 1000usize;
    let node_size = 64i32;
    let ns = node_size as f32;

    // Create atlas (single texture with sub-rects)
    let atlas_size = 4096i32;
    let atlas_cols = atlas_size / node_size;
    let atlas_info = ImageInfo::new_n32_premul((atlas_size, atlas_size), None);
    let mut atlas_surface = gpu.surface.new_surface(&atlas_info).expect("atlas");
    let atlas_canvas = atlas_surface.canvas();
    atlas_canvas.clear(Color::TRANSPARENT);

    let mut atlas_src_rects = Vec::with_capacity(node_count);
    for i in 0..node_count {
        let col = (i as i32) % atlas_cols;
        let row = (i as i32) / atlas_cols;
        let x = col * node_size;
        let y = row * node_size;
        let mut p = Paint::default();
        p.set_color(Color::from_argb(
            255,
            (i * 17 % 256) as u8,
            (i * 31 % 256) as u8,
            (i * 53 % 256) as u8,
        ));
        atlas_canvas.draw_rect(Rect::from_xywh(x as f32, y as f32, ns, ns), &p);
        atlas_src_rects.push(Rect::from_xywh(x as f32, y as f32, ns, ns));
    }
    flush(&mut atlas_surface);
    let atlas_image = atlas_surface.image_snapshot();

    // Also create separate textures for comparison
    let mut separate_textures = Vec::with_capacity(node_count);
    for i in 0..node_count {
        let info = ImageInfo::new_n32_premul((node_size, node_size), None);
        let mut tex_surface = gpu.surface.new_surface(&info).expect("node texture");
        let c = tex_surface.canvas();
        c.clear(Color::TRANSPARENT);
        let mut p = Paint::default();
        p.set_color(Color::from_argb(
            255,
            (i * 17 % 256) as u8,
            (i * 31 % 256) as u8,
            (i * 53 % 256) as u8,
        ));
        c.draw_rect(Rect::from_xywh(0.0, 0.0, ns, ns), &p);
        flush(&mut tex_surface);
        separate_textures.push(tex_surface.image_snapshot());
    }

    // World-space positions (grid layout, spread over a large area)
    let spacing = ns + 4.0;
    let cols = 50usize;
    let world_positions: Vec<(f32, f32)> = (0..node_count)
        .map(|i| {
            let x = (i % cols) as f32 * spacing;
            let y = (i / cols) as f32 * spacing;
            (x, y)
        })
        .collect();

    // Per-node paint with varying opacity (realistic compositor)
    let node_paints: Vec<Paint> = (0..node_count)
        .map(|i| {
            let mut p = Paint::default();
            p.set_alpha_f(0.5 + (i % 6) as f32 * 0.1);
            p
        })
        .collect();

    let surface = &mut gpu.surface;

    // ═══════════════════════════════════════════════════════════════════
    // Test 1: Direct draw at varying target surface sizes
    //
    // Same 1000 blits, same world positions, same camera.
    // Only the target surface size changes.
    // ═══════════════════════════════════════════════════════════════════

    println!("═══════════════════════════════════════════════════════════");
    println!("  TEST 1: Atlas blits at varying target surface sizes");
    println!("  (1000 blits, 64x64 source, camera scale to fit)");
    println!("═══════════════════════════════════════════════════════════");
    println!();

    let target_sizes: &[i32] = &[2000, 1000, 500, 250, 100];

    for &target_size in target_sizes {
        let info = ImageInfo::new_n32_premul((target_size, target_size), None);
        let mut target = surface.new_surface(&info).expect("target surface");

        // Camera scale: fit the world content into the target surface.
        // World extent: cols * spacing ≈ 50 * 68 = 3400px wide
        let world_extent = cols as f32 * spacing;
        let camera_scale = target_size as f32 / world_extent;

        // Warmup
        for frame in 0..warmup {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..node_count {
                let (wx, wy) = world_positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                tc.draw_image_rect(
                    &atlas_image,
                    Some((&atlas_src_rects[i], SrcRectConstraint::Fast)),
                    dst,
                    &node_paints[i],
                );
            }
            tc.restore();
            flush(&mut target);
        }

        // Measure
        flush(&mut target);
        let start = Instant::now();
        for frame in 0..n_iter {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..node_count {
                let (wx, wy) = world_positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                tc.draw_image_rect(
                    &atlas_image,
                    Some((&atlas_src_rects[i], SrcRectConstraint::Fast)),
                    dst,
                    &node_paints[i],
                );
            }
            tc.restore();
            flush(&mut target);
        }
        let avg = start.elapsed() / n_iter;

        println!(
            "  target {:>4}x{:<4} | {:>6} us  ({:>5.0} fps)  {:.1} us/blit  scale={:.3}",
            target_size,
            target_size,
            avg.as_micros(),
            1_000_000.0 / avg.as_micros() as f64,
            avg.as_micros() as f64 / node_count as f64,
            camera_scale,
        );
    }

    println!();

    // ═══════════════════════════════════════════════════════════════════
    // Test 2: Same but with SEPARATE textures (not atlas)
    // Does per-texture overhead dominate regardless of surface size?
    // ═══════════════════════════════════════════════════════════════════

    println!("═══════════════════════════════════════════════════════════");
    println!("  TEST 2: Separate-texture blits at varying target sizes");
    println!("  (1000 blits, 64x64 source, camera scale to fit)");
    println!("═══════════════════════════════════════════════════════════");
    println!();

    for &target_size in target_sizes {
        let info = ImageInfo::new_n32_premul((target_size, target_size), None);
        let mut target = surface.new_surface(&info).expect("target surface");

        let world_extent = cols as f32 * spacing;
        let camera_scale = target_size as f32 / world_extent;

        // Warmup
        for frame in 0..warmup {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            let src = Rect::from_wh(ns, ns);
            for i in 0..node_count {
                let (wx, wy) = world_positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                tc.draw_image_rect(
                    &separate_textures[i],
                    Some((&src, SrcRectConstraint::Fast)),
                    dst,
                    &node_paints[i],
                );
            }
            tc.restore();
            flush(&mut target);
        }

        // Measure
        flush(&mut target);
        let start = Instant::now();
        for frame in 0..n_iter {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            let src = Rect::from_wh(ns, ns);
            for i in 0..node_count {
                let (wx, wy) = world_positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                tc.draw_image_rect(
                    &separate_textures[i],
                    Some((&src, SrcRectConstraint::Fast)),
                    dst,
                    &node_paints[i],
                );
            }
            tc.restore();
            flush(&mut target);
        }
        let avg = start.elapsed() / n_iter;

        println!(
            "  target {:>4}x{:<4} | {:>6} us  ({:>5.0} fps)  {:.1} us/blit  scale={:.3}",
            target_size,
            target_size,
            avg.as_micros(),
            1_000_000.0 / avg.as_micros() as f64,
            avg.as_micros() as f64 / node_count as f64,
            camera_scale,
        );
    }

    println!();

    // ═══════════════════════════════════════════════════════════════════
    // Test 3: Varying blit count at fixed target size
    // Is per-call overhead truly constant or does it depend on coverage?
    // ═══════════════════════════════════════════════════════════════════

    println!("═══════════════════════════════════════════════════════════");
    println!("  TEST 3: Varying blit count at 500x500 target (atlas)");
    println!("═══════════════════════════════════════════════════════════");
    println!();

    let target_size = 500;
    let blit_counts: &[usize] = &[10, 50, 100, 250, 500, 1000];

    for &count in blit_counts {
        let info = ImageInfo::new_n32_premul((target_size, target_size), None);
        let mut target = surface.new_surface(&info).expect("target surface");

        let world_extent = cols as f32 * spacing;
        let camera_scale = target_size as f32 / world_extent;

        // Warmup
        for frame in 0..warmup {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..count {
                let (wx, wy) = world_positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                tc.draw_image_rect(
                    &atlas_image,
                    Some((&atlas_src_rects[i], SrcRectConstraint::Fast)),
                    &dst,
                    &node_paints[i],
                );
            }
            tc.restore();
            flush(&mut target);
        }

        // Measure
        flush(&mut target);
        let start = Instant::now();
        for frame in 0..n_iter {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..count {
                let (wx, wy) = world_positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                tc.draw_image_rect(
                    &atlas_image,
                    Some((&atlas_src_rects[i], SrcRectConstraint::Fast)),
                    &dst,
                    &node_paints[i],
                );
            }
            tc.restore();
            flush(&mut target);
        }
        let avg = start.elapsed() / n_iter;

        println!(
            "  {:>4} blits | {:>6} us  ({:>5.0} fps)  {:.1} us/blit",
            count,
            avg.as_micros(),
            1_000_000.0 / avg.as_micros() as f64,
            avg.as_micros() as f64 / count as f64,
        );
    }

    println!();

    // ═══════════════════════════════════════════════════════════════════
    // Test 4: Draw rect (not image) at varying sizes
    // Baseline: how fast is plain geometry at different surface sizes?
    // ═══════════════════════════════════════════════════════════════════

    println!("═══════════════════════════════════════════════════════════");
    println!("  TEST 4: Plain draw_rect (no textures) at varying sizes");
    println!("  (1000 rects, baseline for fill-rate measurement)");
    println!("═══════════════════════════════════════════════════════════");
    println!();

    for &target_size in target_sizes {
        let info = ImageInfo::new_n32_premul((target_size, target_size), None);
        let mut target = surface.new_surface(&info).expect("target surface");

        let world_extent = cols as f32 * spacing;
        let camera_scale = target_size as f32 / world_extent;

        // Warmup
        for frame in 0..warmup {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..node_count {
                let (wx, wy) = world_positions[i];
                tc.draw_rect(Rect::from_xywh(wx, wy, ns, ns), &node_paints[i]);
            }
            tc.restore();
            flush(&mut target);
        }

        // Measure
        flush(&mut target);
        let start = Instant::now();
        for frame in 0..n_iter {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..node_count {
                let (wx, wy) = world_positions[i];
                tc.draw_rect(Rect::from_xywh(wx, wy, ns, ns), &node_paints[i]);
            }
            tc.restore();
            flush(&mut target);
        }
        let avg = start.elapsed() / n_iter;

        println!(
            "  target {:>4}x{:<4} | {:>6} us  ({:>5.0} fps)  {:.1} us/blit  scale={:.3}",
            target_size,
            target_size,
            avg.as_micros(),
            1_000_000.0 / avg.as_micros() as f64,
            avg.as_micros() as f64 / node_count as f64,
            camera_scale,
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    // Test 5: Live blur effect at varying target sizes
    // This simulates what happens when nodes with blur are drawn live
    // (not from compositor cache). The blur filter should be cheaper
    // at smaller target sizes because fewer pixels are processed.
    // ═══════════════════════════════════════════════════════════════════

    println!();
    println!("═══════════════════════════════════════════════════════════");
    println!("  TEST 5: Live blur (save_layer + blur filter) varying sizes");
    println!("  (100 rects with gaussian blur, live rasterized)");
    println!("═══════════════════════════════════════════════════════════");
    println!();

    let blur_count = 100usize;

    for &target_size in target_sizes {
        let info = ImageInfo::new_n32_premul((target_size, target_size), None);
        let mut target = surface.new_surface(&info).expect("target surface");

        let world_extent = cols as f32 * spacing;
        let camera_scale = target_size as f32 / world_extent;

        let blur_filter = skia_safe::image_filters::blur((8.0, 8.0), None, None, None);

        // Warmup
        for frame in 0..warmup {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..blur_count {
                let (wx, wy) = world_positions[i];
                let rect = Rect::from_xywh(wx, wy, ns, ns);
                // save_layer with blur filter (simulates live blur draw)
                let mut layer_paint = Paint::default();
                layer_paint.set_image_filter(blur_filter.clone());
                let layer_rec = skia_safe::canvas::SaveLayerRec::default()
                    .bounds(&rect)
                    .paint(&layer_paint);
                tc.save_layer(&layer_rec);
                tc.draw_rect(rect, &node_paints[i]);
                tc.restore();
            }
            tc.restore();
            flush(&mut target);
        }

        // Measure
        flush(&mut target);
        let start = Instant::now();
        for frame in 0..n_iter {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..blur_count {
                let (wx, wy) = world_positions[i];
                let rect = Rect::from_xywh(wx, wy, ns, ns);
                let mut layer_paint = Paint::default();
                layer_paint.set_image_filter(blur_filter.clone());
                let layer_rec = skia_safe::canvas::SaveLayerRec::default()
                    .bounds(&rect)
                    .paint(&layer_paint);
                tc.save_layer(&layer_rec);
                tc.draw_rect(rect, &node_paints[i]);
                tc.restore();
            }
            tc.restore();
            flush(&mut target);
        }
        let avg = start.elapsed() / n_iter;

        println!(
            "  target {:>4}x{:<4} | {:>6} us  ({:>5.0} fps)  {:>5.1} us/blur  scale={:.3}",
            target_size,
            target_size,
            avg.as_micros(),
            1_000_000.0 / avg.as_micros() as f64,
            avg.as_micros() as f64 / blur_count as f64,
            camera_scale,
        );
    }

    println!();

    // ═══════════════════════════════════════════════════════════════════
    // Test 6: Live drop shadow at varying target sizes
    // ═══════════════════════════════════════════════════════════════════

    println!("═══════════════════════════════════════════════════════════");
    println!("  TEST 6: Live drop shadow varying sizes");
    println!("  (100 rects with drop_shadow filter, live rasterized)");
    println!("═══════════════════════════════════════════════════════════");
    println!();

    for &target_size in target_sizes {
        let info = ImageInfo::new_n32_premul((target_size, target_size), None);
        let mut target = surface.new_surface(&info).expect("target surface");

        let world_extent = cols as f32 * spacing;
        let camera_scale = target_size as f32 / world_extent;

        let shadow_filter = skia_safe::image_filters::drop_shadow(
            (4.0, 4.0),
            (8.0, 8.0),
            Color::from_argb(128, 0, 0, 0),
            None,
            None,
            None,
        );

        // Warmup
        for frame in 0..warmup {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..blur_count {
                let (wx, wy) = world_positions[i];
                let rect = Rect::from_xywh(wx, wy, ns, ns);
                let mut layer_paint = Paint::default();
                layer_paint.set_image_filter(shadow_filter.clone());
                let layer_rec = skia_safe::canvas::SaveLayerRec::default()
                    .bounds(&rect)
                    .paint(&layer_paint);
                tc.save_layer(&layer_rec);
                tc.draw_rect(rect, &node_paints[i]);
                tc.restore();
            }
            tc.restore();
            flush(&mut target);
        }

        // Measure
        flush(&mut target);
        let start = Instant::now();
        for frame in 0..n_iter {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..blur_count {
                let (wx, wy) = world_positions[i];
                let rect = Rect::from_xywh(wx, wy, ns, ns);
                let mut layer_paint = Paint::default();
                layer_paint.set_image_filter(shadow_filter.clone());
                let layer_rec = skia_safe::canvas::SaveLayerRec::default()
                    .bounds(&rect)
                    .paint(&layer_paint);
                tc.save_layer(&layer_rec);
                tc.draw_rect(rect, &node_paints[i]);
                tc.restore();
            }
            tc.restore();
            flush(&mut target);
        }
        let avg = start.elapsed() / n_iter;

        println!(
            "  target {:>4}x{:<4} | {:>6} us  ({:>5.0} fps)  {:>5.1} us/shadow  scale={:.3}",
            target_size,
            target_size,
            avg.as_micros(),
            1_000_000.0 / avg.as_micros() as f64,
            avg.as_micros() as f64 / blur_count as f64,
            camera_scale,
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    // Test 7: Mixed live draw (fills + strokes + rounded rects)
    // No effects — pure geometry at varying resolution
    // ═══════════════════════════════════════════════════════════════════

    println!();
    println!("═══════════════════════════════════════════════════════════");
    println!("  TEST 7: Mixed geometry (1000 rounded rects + strokes)");
    println!("═══════════════════════════════════════════════════════════");
    println!();

    for &target_size in target_sizes {
        let info = ImageInfo::new_n32_premul((target_size, target_size), None);
        let mut target = surface.new_surface(&info).expect("target surface");

        let world_extent = cols as f32 * spacing;
        let camera_scale = target_size as f32 / world_extent;

        // Warmup
        for frame in 0..warmup {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..node_count {
                let (wx, wy) = world_positions[i];
                let rrect =
                    skia_safe::RRect::new_rect_xy(Rect::from_xywh(wx, wy, ns, ns), 8.0, 8.0);
                // Fill
                tc.draw_rrect(rrect, &node_paints[i]);
                // Stroke
                let mut stroke = Paint::default();
                stroke.set_style(skia_safe::PaintStyle::Stroke);
                stroke.set_stroke_width(2.0);
                stroke.set_color(Color::from_argb(200, 0, 0, 0));
                stroke.set_anti_alias(true);
                tc.draw_rrect(rrect, &stroke);
            }
            tc.restore();
            flush(&mut target);
        }

        // Measure
        flush(&mut target);
        let start = Instant::now();
        for frame in 0..n_iter {
            let pan_x = frame as f32 * 2.0 * camera_scale;
            let tc = target.canvas();
            tc.clear(Color::WHITE);
            tc.save();
            tc.scale((camera_scale, camera_scale));
            tc.translate((pan_x, 0.0));
            for i in 0..node_count {
                let (wx, wy) = world_positions[i];
                let rrect =
                    skia_safe::RRect::new_rect_xy(Rect::from_xywh(wx, wy, ns, ns), 8.0, 8.0);
                tc.draw_rrect(rrect, &node_paints[i]);
                let mut stroke = Paint::default();
                stroke.set_style(skia_safe::PaintStyle::Stroke);
                stroke.set_stroke_width(2.0);
                stroke.set_color(Color::from_argb(200, 0, 0, 0));
                stroke.set_anti_alias(true);
                tc.draw_rrect(rrect, &stroke);
            }
            tc.restore();
            flush(&mut target);
        }
        let avg = start.elapsed() / n_iter;

        println!(
            "  target {:>4}x{:<4} | {:>6} us  ({:>5.0} fps)  {:.1} us/node  scale={:.3}",
            target_size,
            target_size,
            avg.as_micros(),
            1_000_000.0 / avg.as_micros() as f64,
            avg.as_micros() as f64 / node_count as f64,
            camera_scale,
        );
    }

    println!("\nDone.");
}
