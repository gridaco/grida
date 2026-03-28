//! Texture Atlas Hypothesis Microbenchmark
//!
//! Tests whether packing per-node cached images into a shared atlas texture
//! actually reduces `gpu_flush` overhead compared to individual textures.
//!
//! The hypothesis: 1000 blits from 1 atlas (same-texture sub-rects) should be
//! dramatically faster than 1000 blits from 1000 separate textures, because
//! same-texture draws batch on the GPU while different textures force state
//! changes.
//!
//! We test at multiple scales:
//!   - Node sizes: 32x32, 64x64, 100x100, 200x200
//!   - Texture counts: 100, 500, 1000, 2000
//!   - Atlas vs separate textures
//!   - We measure TOTAL frame time including gpu_flush, not just CPU-side draw
//!
//! ```bash
//! cargo run -p cg --example skia_bench_atlas --features native-gl-context --release
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

    let surface = &mut gpu.surface;
    let warmup = 50;
    let n_iter = 200;

    println!("=== Atlas Hypothesis Microbenchmark ===");
    println!("warmup={warmup}, iterations={n_iter}");
    println!();

    // ─── Helper: flush GPU and wait for completion ───────────────────
    fn flush(surface: &mut Surface) {
        if let Some(mut ctx) = surface.recording_context() {
            if let Some(mut direct) = ctx.as_direct_context() {
                direct.flush_and_submit();
            }
        }
    }

    // ─── Helper: create N individual textures of given size ──────────
    fn create_separate_textures(
        surface: &mut Surface,
        count: usize,
        size: i32,
    ) -> Vec<skia_safe::Image> {
        let info = ImageInfo::new_n32_premul((size, size), None);
        let mut textures = Vec::with_capacity(count);
        for i in 0..count {
            let mut off = surface.new_surface(&info).expect("offscreen");
            let c = off.canvas();
            c.clear(Color::TRANSPARENT);
            let mut p = Paint::default();
            // Vary color so each texture is genuinely different
            p.set_color(Color::from_argb(
                255,
                (i * 17 % 256) as u8,
                (i * 31 % 256) as u8,
                (i * 53 % 256) as u8,
            ));
            c.draw_rect(Rect::from_xywh(0.0, 0.0, size as f32, size as f32), &p);
            textures.push(off.image_snapshot());
        }
        flush(surface);
        textures
    }

    // ─── Helper: create atlas texture and return (atlas_image, slot_rects) ──
    fn create_atlas(
        surface: &mut Surface,
        count: usize,
        node_size: i32,
        atlas_size: i32,
    ) -> (skia_safe::Image, Vec<Rect>) {
        let info = ImageInfo::new_n32_premul((atlas_size, atlas_size), None);
        let mut atlas_surface = surface.new_surface(&info).expect("atlas surface");
        let canvas = atlas_surface.canvas();
        canvas.clear(Color::TRANSPARENT);

        let cols = atlas_size / node_size;
        let mut slots = Vec::with_capacity(count);

        for i in 0..count {
            let col = (i as i32) % cols;
            let row = (i as i32) / cols;
            let x = col * node_size;
            let y = row * node_size;

            let mut p = Paint::default();
            p.set_color(Color::from_argb(
                255,
                (i * 17 % 256) as u8,
                (i * 31 % 256) as u8,
                (i * 53 % 256) as u8,
            ));
            canvas.draw_rect(
                Rect::from_xywh(x as f32, y as f32, node_size as f32, node_size as f32),
                &p,
            );
            slots.push(Rect::from_xywh(
                x as f32,
                y as f32,
                node_size as f32,
                node_size as f32,
            ));
        }

        flush(surface);
        let image = atlas_surface.image_snapshot();
        (image, slots)
    }

    // ─── Helper: benchmark blit from separate textures ───────────────
    fn bench_separate(
        surface: &mut Surface,
        textures: &[skia_safe::Image],
        count: usize,
        node_size: f32,
        warmup: u32,
        n_iter: u32,
    ) -> std::time::Duration {
        let src = Rect::from_wh(node_size, node_size);
        let paint = Paint::default();

        // Warmup
        for _ in 0..warmup {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                let x = (i % 100) as f32 * (node_size + 2.0);
                let y = (i / 100) as f32 * (node_size + 2.0);
                let dst = Rect::from_xywh(x, y, node_size, node_size);
                canvas.draw_image_rect(
                    &textures[i % textures.len()],
                    Some((&src, SrcRectConstraint::Fast)),
                    dst,
                    &paint,
                );
            }
            flush(surface);
        }

        // Measure
        flush(surface);
        let start = Instant::now();
        for _ in 0..n_iter {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                let x = (i % 100) as f32 * (node_size + 2.0);
                let y = (i / 100) as f32 * (node_size + 2.0);
                let dst = Rect::from_xywh(x, y, node_size, node_size);
                canvas.draw_image_rect(
                    &textures[i % textures.len()],
                    Some((&src, SrcRectConstraint::Fast)),
                    dst,
                    &paint,
                );
            }
            flush(surface);
        }
        start.elapsed() / n_iter
    }

    // ─── Helper: benchmark blit from atlas sub-rects ─────────────────
    fn bench_atlas(
        surface: &mut Surface,
        atlas: &skia_safe::Image,
        slots: &[Rect],
        count: usize,
        node_size: f32,
        warmup: u32,
        n_iter: u32,
    ) -> std::time::Duration {
        let paint = Paint::default();

        // Warmup
        for _ in 0..warmup {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                let x = (i % 100) as f32 * (node_size + 2.0);
                let y = (i / 100) as f32 * (node_size + 2.0);
                let dst = Rect::from_xywh(x, y, node_size, node_size);
                let src = &slots[i % slots.len()];
                canvas.draw_image_rect(atlas, Some((src, SrcRectConstraint::Fast)), dst, &paint);
            }
            flush(surface);
        }

        // Measure
        flush(surface);
        let start = Instant::now();
        for _ in 0..n_iter {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                let x = (i % 100) as f32 * (node_size + 2.0);
                let y = (i / 100) as f32 * (node_size + 2.0);
                let dst = Rect::from_xywh(x, y, node_size, node_size);
                let src = &slots[i % slots.len()];
                canvas.draw_image_rect(atlas, Some((src, SrcRectConstraint::Fast)), dst, &paint);
            }
            flush(surface);
        }
        start.elapsed() / n_iter
    }

    // ─── Helper: benchmark same-texture blit (best case) ─────────────
    fn bench_same_texture(
        surface: &mut Surface,
        texture: &skia_safe::Image,
        count: usize,
        node_size: f32,
        warmup: u32,
        n_iter: u32,
    ) -> std::time::Duration {
        let src = Rect::from_wh(node_size, node_size);
        let paint = Paint::default();

        // Warmup
        for _ in 0..warmup {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                let x = (i % 100) as f32 * (node_size + 2.0);
                let y = (i / 100) as f32 * (node_size + 2.0);
                let dst = Rect::from_xywh(x, y, node_size, node_size);
                canvas.draw_image_rect(texture, Some((&src, SrcRectConstraint::Fast)), dst, &paint);
            }
            flush(surface);
        }

        // Measure
        flush(surface);
        let start = Instant::now();
        for _ in 0..n_iter {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                let x = (i % 100) as f32 * (node_size + 2.0);
                let y = (i / 100) as f32 * (node_size + 2.0);
                let dst = Rect::from_xywh(x, y, node_size, node_size);
                canvas.draw_image_rect(texture, Some((&src, SrcRectConstraint::Fast)), dst, &paint);
            }
            flush(surface);
        }
        start.elapsed() / n_iter
    }

    // ═══════════════════════════════════════════════════════════════════
    // Test matrix: node_size × blit_count
    // ═══════════════════════════════════════════════════════════════════

    let node_sizes: &[i32] = &[32, 64, 100, 200];
    let blit_counts: &[usize] = &[100, 500, 1000, 2000];

    for &node_size in node_sizes {
        println!("── Node size: {node_size}x{node_size} ──────────────────────────────");
        println!(
            "{:<14} {:>10} {:>10} {:>10} {:>10}  {:>8}",
            "mode", "total_us", "us/blit", "fps", "gpu_ops", "speedup"
        );

        for &count in blit_counts {
            // Determine atlas size needed
            let atlas_size = if node_size <= 64 { 4096 } else { 4096 };
            let slots_per_row = atlas_size / node_size;
            let max_slots = (slots_per_row * slots_per_row) as usize;

            if count > max_slots {
                println!(
                    "  skip count={count} — exceeds atlas capacity ({max_slots} slots in {atlas_size}x{atlas_size})"
                );
                continue;
            }

            // Create textures
            let separate = create_separate_textures(surface, count, node_size);
            let (atlas_img, atlas_slots) = create_atlas(surface, count, node_size, atlas_size);

            // --- A: All separate textures (worst case) ---
            let t_separate =
                bench_separate(surface, &separate, count, node_size as f32, warmup, n_iter);

            // --- B: Atlas sub-rects (hypothesis: should be faster) ---
            let t_atlas = bench_atlas(
                surface,
                &atlas_img,
                &atlas_slots,
                count,
                node_size as f32,
                warmup,
                n_iter,
            );

            // --- C: Same texture repeated (best case, upper bound) ---
            let t_same = bench_same_texture(
                surface,
                &separate[0],
                count,
                node_size as f32,
                warmup,
                n_iter,
            );

            let speedup_atlas = t_separate.as_micros() as f64 / t_atlas.as_micros().max(1) as f64;
            let speedup_same = t_separate.as_micros() as f64 / t_same.as_micros().max(1) as f64;

            println!(
                "  separate x{:<4}  {:>7} us  {:>7.1}  {:>7.0}  {:>8}  {:>7}",
                count,
                t_separate.as_micros(),
                t_separate.as_micros() as f64 / count as f64,
                1_000_000.0 / t_separate.as_micros() as f64,
                count,
                "1.0x",
            );
            println!(
                "  atlas    x{:<4}  {:>7} us  {:>7.1}  {:>7.0}  {:>8}  {:>5.1}x",
                count,
                t_atlas.as_micros(),
                t_atlas.as_micros() as f64 / count as f64,
                1_000_000.0 / t_atlas.as_micros() as f64,
                count,
                speedup_atlas,
            );
            println!(
                "  same_tex x{:<4}  {:>7} us  {:>7.1}  {:>7.0}  {:>8}  {:>5.1}x",
                count,
                t_same.as_micros(),
                t_same.as_micros() as f64 / count as f64,
                1_000_000.0 / t_same.as_micros() as f64,
                count,
                speedup_same,
            );
            println!();

            // Free textures
            drop(separate);
            drop(atlas_img);
            drop(atlas_slots);
            flush(surface);
        }
        println!();
    }

    // ═══════════════════════════════════════════════════════════════════
    // Bonus: Test with per-blit opacity/blend (realistic compositor path)
    // The real compositor applies per-node opacity and blend mode.
    // Does this change the atlas vs separate comparison?
    // ═══════════════════════════════════════════════════════════════════

    println!("── With per-blit opacity (realistic compositor) ─────────────");
    println!("   Node size: 64x64, count: 1000");
    println!();

    let node_size = 64;
    let count = 1000;
    let separate = create_separate_textures(surface, count, node_size);
    let (atlas_img, atlas_slots) = create_atlas(surface, count, node_size, 4096);

    // Separate with per-blit opacity
    {
        flush(surface);
        for _ in 0..warmup {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            let src = Rect::from_wh(node_size as f32, node_size as f32);
            for i in 0..count {
                let x = (i % 100) as f32 * 66.0;
                let y = (i / 100) as f32 * 66.0;
                let dst = Rect::from_xywh(x, y, node_size as f32, node_size as f32);
                let mut paint = Paint::default();
                paint.set_alpha_f(0.5 + (i % 10) as f32 * 0.05);
                canvas.draw_image_rect(
                    &separate[i],
                    Some((&src, SrcRectConstraint::Fast)),
                    dst,
                    &paint,
                );
            }
            flush(surface);
        }
        flush(surface);
        let start = Instant::now();
        for _ in 0..n_iter {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            let src = Rect::from_wh(node_size as f32, node_size as f32);
            for i in 0..count {
                let x = (i % 100) as f32 * 66.0;
                let y = (i / 100) as f32 * 66.0;
                let dst = Rect::from_xywh(x, y, node_size as f32, node_size as f32);
                let mut paint = Paint::default();
                paint.set_alpha_f(0.5 + (i % 10) as f32 * 0.05);
                canvas.draw_image_rect(
                    &separate[i],
                    Some((&src, SrcRectConstraint::Fast)),
                    dst,
                    &paint,
                );
            }
            flush(surface);
        }
        let avg = start.elapsed() / n_iter;
        println!(
            "  separate+opacity x1000 | {:>7} us  {:.1} us/blit  {:.0} fps",
            avg.as_micros(),
            avg.as_micros() as f64 / 1000.0,
            1_000_000.0 / avg.as_micros() as f64,
        );
    }

    // Atlas with per-blit opacity
    {
        flush(surface);
        for _ in 0..warmup {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                let x = (i % 100) as f32 * 66.0;
                let y = (i / 100) as f32 * 66.0;
                let dst = Rect::from_xywh(x, y, node_size as f32, node_size as f32);
                let mut paint = Paint::default();
                paint.set_alpha_f(0.5 + (i % 10) as f32 * 0.05);
                canvas.draw_image_rect(
                    &atlas_img,
                    Some((&atlas_slots[i], SrcRectConstraint::Fast)),
                    dst,
                    &paint,
                );
            }
            flush(surface);
        }
        flush(surface);
        let start = Instant::now();
        for _ in 0..n_iter {
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            for i in 0..count {
                let x = (i % 100) as f32 * 66.0;
                let y = (i / 100) as f32 * 66.0;
                let dst = Rect::from_xywh(x, y, node_size as f32, node_size as f32);
                let mut paint = Paint::default();
                paint.set_alpha_f(0.5 + (i % 10) as f32 * 0.05);
                canvas.draw_image_rect(
                    &atlas_img,
                    Some((&atlas_slots[i], SrcRectConstraint::Fast)),
                    dst,
                    &paint,
                );
            }
            flush(surface);
        }
        let avg = start.elapsed() / n_iter;
        println!(
            "  atlas+opacity    x1000 | {:>7} us  {:.1} us/blit  {:.0} fps",
            avg.as_micros(),
            avg.as_micros() as f64 / 1000.0,
            1_000_000.0 / avg.as_micros() as f64,
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    // Pan simulation: camera translates each frame, nodes shift position.
    // This is the exact compositor path during hand-tool drag.
    //
    // Each frame:
    //   1. Clear canvas
    //   2. Apply camera transform (translate)
    //   3. Blit all cached nodes at their world-space positions
    //   4. Flush GPU
    //
    // The camera offset changes every frame (simulating smooth pan).
    // This tests whether the atlas advantage holds when destination rects
    // shift every frame (i.e. GPU can't reuse previous frame's output).
    // ═══════════════════════════════════════════════════════════════════

    println!();
    println!("══════════════════════════════════════════════════════════════");
    println!("  PAN SIMULATION (camera translates each frame)");
    println!("══════════════════════════════════════════════════════════════");
    println!();

    for &(node_size, count) in &[(64i32, 1000usize), (32, 2000), (100, 1000)] {
        let atlas_size = 4096;
        let slots_per_row = atlas_size / node_size;
        let max_slots = (slots_per_row * slots_per_row) as usize;
        if count > max_slots {
            println!(
                "  skip {}x{} x{} — exceeds atlas capacity",
                node_size, node_size, count
            );
            continue;
        }

        let separate = create_separate_textures(surface, count, node_size);
        let (atlas_img, atlas_slots) = create_atlas(surface, count, node_size, atlas_size);

        let ns = node_size as f32;
        let spacing = ns + 4.0;

        // Pre-compute world-space positions for each node (grid layout).
        let positions: Vec<(f32, f32)> = (0..count)
            .map(|i| {
                let x = (i % 100) as f32 * spacing;
                let y = (i / 100) as f32 * spacing;
                (x, y)
            })
            .collect();

        // --- Pan with separate textures ---
        {
            // Warmup
            for frame in 0..warmup {
                let pan_x = frame as f32 * 2.5;
                let pan_y = frame as f32 * 1.0;
                let canvas = surface.canvas();
                canvas.clear(Color::WHITE);
                canvas.save();
                canvas.translate((pan_x, pan_y));
                let paint = Paint::default();
                let src = Rect::from_wh(ns, ns);
                for i in 0..count {
                    let (wx, wy) = positions[i];
                    let dst = Rect::from_xywh(wx, wy, ns, ns);
                    canvas.draw_image_rect(
                        &separate[i % separate.len()],
                        Some((&src, SrcRectConstraint::Fast)),
                        dst,
                        &paint,
                    );
                }
                canvas.restore();
                flush(surface);
            }

            flush(surface);
            let start = Instant::now();
            for frame in 0..n_iter {
                let pan_x = frame as f32 * 2.5;
                let pan_y = frame as f32 * 1.0;
                let canvas = surface.canvas();
                canvas.clear(Color::WHITE);
                canvas.save();
                canvas.translate((pan_x, pan_y));
                let paint = Paint::default();
                let src = Rect::from_wh(ns, ns);
                for i in 0..count {
                    let (wx, wy) = positions[i];
                    let dst = Rect::from_xywh(wx, wy, ns, ns);
                    canvas.draw_image_rect(
                        &separate[i % separate.len()],
                        Some((&src, SrcRectConstraint::Fast)),
                        dst,
                        &paint,
                    );
                }
                canvas.restore();
                flush(surface);
            }
            let t_sep = start.elapsed() / n_iter;

            // --- Pan with atlas ---
            // Warmup
            for frame in 0..warmup {
                let pan_x = frame as f32 * 2.5;
                let pan_y = frame as f32 * 1.0;
                let canvas = surface.canvas();
                canvas.clear(Color::WHITE);
                canvas.save();
                canvas.translate((pan_x, pan_y));
                let paint = Paint::default();
                for i in 0..count {
                    let (wx, wy) = positions[i];
                    let dst = Rect::from_xywh(wx, wy, ns, ns);
                    canvas.draw_image_rect(
                        &atlas_img,
                        Some((&atlas_slots[i % atlas_slots.len()], SrcRectConstraint::Fast)),
                        dst,
                        &paint,
                    );
                }
                canvas.restore();
                flush(surface);
            }

            flush(surface);
            let start = Instant::now();
            for frame in 0..n_iter {
                let pan_x = frame as f32 * 2.5;
                let pan_y = frame as f32 * 1.0;
                let canvas = surface.canvas();
                canvas.clear(Color::WHITE);
                canvas.save();
                canvas.translate((pan_x, pan_y));
                let paint = Paint::default();
                for i in 0..count {
                    let (wx, wy) = positions[i];
                    let dst = Rect::from_xywh(wx, wy, ns, ns);
                    canvas.draw_image_rect(
                        &atlas_img,
                        Some((&atlas_slots[i % atlas_slots.len()], SrcRectConstraint::Fast)),
                        dst,
                        &paint,
                    );
                }
                canvas.restore();
                flush(surface);
            }
            let t_atlas = start.elapsed() / n_iter;

            let speedup = t_sep.as_micros() as f64 / t_atlas.as_micros().max(1) as f64;

            println!("  Pan {}x{} x{}:", node_size, node_size, count);
            println!(
                "    separate  {:>7} us  ({:>5.0} fps)  {:.1} us/blit",
                t_sep.as_micros(),
                1_000_000.0 / t_sep.as_micros() as f64,
                t_sep.as_micros() as f64 / count as f64,
            );
            println!(
                "    atlas     {:>7} us  ({:>5.0} fps)  {:.1} us/blit  -> {:.1}x faster",
                t_atlas.as_micros(),
                1_000_000.0 / t_atlas.as_micros() as f64,
                t_atlas.as_micros() as f64 / count as f64,
                speedup,
            );
            println!();
        }

        drop(separate);
        drop(atlas_img);
        drop(atlas_slots);
        flush(surface);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Pan + per-node opacity + blend mode (full compositor simulation)
    //
    // Each node has:
    //   - Its own opacity (varies per node, like real compositor)
    //   - A blend mode (Normal for most, some with Multiply)
    //   - Camera transform applied (pan)
    //
    // This is the closest simulation to what `draw()` in scene.rs does
    // when blitting promoted compositor nodes during pan.
    // ═══════════════════════════════════════════════════════════════════

    println!("══════════════════════════════════════════════════════════════");
    println!("  FULL COMPOSITOR SIMULATION");
    println!("  (pan + per-node opacity + blend mode, 64x64, 1000 nodes)");
    println!("══════════════════════════════════════════════════════════════");
    println!();

    let node_size = 64i32;
    let count = 1000usize;
    let ns = node_size as f32;
    let spacing = ns + 4.0;

    let separate = create_separate_textures(surface, count, node_size);
    let (atlas_img, atlas_slots) = create_atlas(surface, count, node_size, 4096);

    let positions: Vec<(f32, f32)> = (0..count)
        .map(|i| {
            let x = (i % 50) as f32 * spacing;
            let y = (i / 50) as f32 * spacing;
            (x, y)
        })
        .collect();

    // Pre-compute per-node paint (opacity + blend mode)
    let node_paints: Vec<Paint> = (0..count)
        .map(|i| {
            let mut p = Paint::default();
            p.set_alpha_f(0.3 + (i % 8) as f32 * 0.1); // 0.3 to 1.0
            if i % 20 == 0 {
                p.set_blend_mode(skia_safe::BlendMode::Multiply);
            }
            p
        })
        .collect();

    // --- Separate textures ---
    let t_sep_full;
    {
        for frame in 0..warmup {
            let pan_x = frame as f32 * 3.0;
            let pan_y = frame as f32 * 1.5;
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            canvas.save();
            canvas.translate((pan_x, pan_y));
            let src = Rect::from_wh(ns, ns);
            for i in 0..count {
                let (wx, wy) = positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                canvas.draw_image_rect(
                    &separate[i],
                    Some((&src, SrcRectConstraint::Fast)),
                    dst,
                    &node_paints[i],
                );
            }
            canvas.restore();
            flush(surface);
        }

        flush(surface);
        let start = Instant::now();
        for frame in 0..n_iter {
            let pan_x = frame as f32 * 3.0;
            let pan_y = frame as f32 * 1.5;
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            canvas.save();
            canvas.translate((pan_x, pan_y));
            let src = Rect::from_wh(ns, ns);
            for i in 0..count {
                let (wx, wy) = positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                canvas.draw_image_rect(
                    &separate[i],
                    Some((&src, SrcRectConstraint::Fast)),
                    dst,
                    &node_paints[i],
                );
            }
            canvas.restore();
            flush(surface);
        }
        t_sep_full = start.elapsed() / n_iter;
        println!(
            "  separate  {:>7} us  ({:>5.0} fps)  {:.1} us/blit",
            t_sep_full.as_micros(),
            1_000_000.0 / t_sep_full.as_micros() as f64,
            t_sep_full.as_micros() as f64 / count as f64,
        );
    }

    // --- Atlas ---
    {
        for frame in 0..warmup {
            let pan_x = frame as f32 * 3.0;
            let pan_y = frame as f32 * 1.5;
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            canvas.save();
            canvas.translate((pan_x, pan_y));
            for i in 0..count {
                let (wx, wy) = positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                canvas.draw_image_rect(
                    &atlas_img,
                    Some((&atlas_slots[i], SrcRectConstraint::Fast)),
                    dst,
                    &node_paints[i],
                );
            }
            canvas.restore();
            flush(surface);
        }

        flush(surface);
        let start = Instant::now();
        for frame in 0..n_iter {
            let pan_x = frame as f32 * 3.0;
            let pan_y = frame as f32 * 1.5;
            let canvas = surface.canvas();
            canvas.clear(Color::WHITE);
            canvas.save();
            canvas.translate((pan_x, pan_y));
            for i in 0..count {
                let (wx, wy) = positions[i];
                let dst = Rect::from_xywh(wx, wy, ns, ns);
                canvas.draw_image_rect(
                    &atlas_img,
                    Some((&atlas_slots[i], SrcRectConstraint::Fast)),
                    dst,
                    &node_paints[i],
                );
            }
            canvas.restore();
            flush(surface);
        }
        let t_atlas = start.elapsed() / n_iter;

        let speedup = t_sep_full.as_micros() as f64 / t_atlas.as_micros().max(1) as f64;
        println!(
            "  atlas     {:>7} us  ({:>5.0} fps)  {:.1} us/blit  -> {:.1}x faster",
            t_atlas.as_micros(),
            1_000_000.0 / t_atlas.as_micros() as f64,
            t_atlas.as_micros() as f64 / count as f64,
            speedup,
        );
    }

    println!("\nDone.");
}
