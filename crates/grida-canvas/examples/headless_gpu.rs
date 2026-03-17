//! Headless GPU rendering demo.
//!
//! Renders a 4900-node scene using the GPU backend without opening a window,
//! and prints per-frame timing stats for various camera positions.
//!
//! Usage:
//!   cargo run -p cg --example headless_gpu --features native-gl-context [--release]

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::scene::FrameFlushResult;
use cg::window::headless::HeadlessGpu;
use std::time::Instant;

fn create_grid_scene(cols: u32, rows: u32) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let size = 20.0f32;
    let gap = 10.0f32;
    for y in 0..rows {
        for x in 0..cols {
            let mut rect = nf.create_rectangle_node();
            rect.transform = math2::transform::AffineTransform::new(
                x as f32 * (size + gap),
                y as f32 * (size + gap),
                0.0,
            );
            rect.size = Size { width: size, height: size };
            rect.set_fill(Paint::Solid(SolidPaint {
                color: CGColor::from_rgba(
                    ((x * 7) % 255) as u8,
                    ((y * 11) % 255) as u8,
                    180, 255,
                ),
                blend_mode: BlendMode::default(),
                active: true,
            }));
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }
    Scene {
        name: "Grid".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

fn main() {
    println!("=== Headless GPU Rendering Benchmark ===\n");

    let mut gpu = HeadlessGpu::new(1000, 1000).expect("GPU init");
    gpu.print_gl_info();

    // --- 4900 nodes (70x70) ---
    println!("\n--- 4900 nodes (70x70) ---");
    run_benchmark(&mut gpu, 70, 70);

    // --- 10000 nodes (100x100) ---
    println!("\n--- 10000 nodes (100x100) ---");
    run_benchmark(&mut gpu, 100, 100);

    println!("\nDone.");
}

fn run_benchmark(gpu: &mut HeadlessGpu, cols: u32, rows: u32) {
    let total = cols * rows;
    let scene = create_grid_scene(cols, rows);
    let mut renderer = gpu.create_renderer();
    renderer.load_scene(scene);
    println!("Loaded scene: {} nodes", total);

    let scene_extent = cols as f32 * 30.0; // size(20) + gap(10)
    let scenarios: Vec<(&str, f32, f32, f32)> = vec![
        ("all_visible (zoom out)", scene_extent / 2.0, scene_extent / 2.0, 1000.0 / scene_extent),
        ("partial (~25%)",         0.0,    0.0,    1.0),
        ("corner (~5%)",           0.0,    0.0,    2.0),
        ("zoomed_in (~1%)",        scene_extent / 2.0, scene_extent / 2.0, 10.0),
        ("empty (offscreen)",      99999.0, 99999.0, 1.0),
    ];

    let num_frames = 100;

    for (name, cx, cy, zoom) in &scenarios {
        renderer.camera.set_center(*cx, *cy);
        renderer.camera.set_zoom(*zoom);

        // Warm up
        for _ in 0..5 {
            renderer.camera.translate(0.1, 0.0);
            renderer.queue_unstable();
            let _ = renderer.flush();
        }

        // Measure
        let start = Instant::now();
        let mut total_frame_us = 0u64;
        let mut display_list_total = 0usize;
        let mut pic_used_total = 0usize;
        let mut comp_hits_total = 0usize;
        let mut comp_size_last = 0usize;
        let mut live_total = 0usize;

        for i in 0..num_frames {
            let dx = if i % 2 == 0 { 1.0 } else { -1.0 };
            renderer.camera.translate(dx, 0.0);
            renderer.queue_unstable();
            if let FrameFlushResult::OK(stats) = renderer.flush() {
                total_frame_us += stats.frame_duration.as_micros() as u64;
                display_list_total += stats.frame.display_list_size_estimated;
                pic_used_total += stats.draw.cache_picture_used;
                comp_hits_total += stats.draw.layer_image_cache_hits;
                comp_size_last = stats.draw.layer_image_cache_size;
                live_total += stats.draw.live_draw_count;
            }
        }

        let wall_ms = start.elapsed().as_secs_f64() * 1000.0;
        let avg_frame_us = total_frame_us / num_frames as u64;
        let avg_dl = display_list_total / num_frames;
        let avg_pic = pic_used_total / num_frames;
        let avg_comp_hits = comp_hits_total / num_frames;
        let avg_live = live_total / num_frames;
        let fps = 1_000_000.0 / avg_frame_us as f64;

        println!(
            "  {name:<25} | avg {avg_frame_us:>6} \u{00b5}s ({fps:>7.1} fps) | \
             dl: {avg_dl:>5} | pic: {avg_pic:>5} | comp: {comp_size_last:>5} ({avg_comp_hits:>5} hit) | live: {avg_live:>5} | wall: {wall_ms:.1} ms",
        );
    }

    drop(renderer);
}
