use super::args::{BenchArgs, BenchReportArgs};
use super::report::*;
use anyhow::{anyhow, Result};
use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::{Node, Scene, Size};
use cg::runtime::scene::FrameFlushResult;
use cg::window::headless::HeadlessGpu;
use math2::transform::AffineTransform;
use std::path::{Path, PathBuf};
use std::time::Instant;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

fn count_effects_nodes(renderer: &cg::runtime::scene::Renderer) -> usize {
    renderer
        .scene
        .as_ref()
        .map(|s| {
            s.graph
                .nodes_iter()
                .filter(|(_, node)| match node {
                    Node::Rectangle(r) => r.effects.has_expensive_effects(),
                    Node::Ellipse(e) => e.effects.has_expensive_effects(),
                    _ => false,
                })
                .count()
        })
        .unwrap_or(0)
}

fn warmup(renderer: &mut cg::runtime::scene::Renderer) {
    renderer.queue_stable();
    let _ = renderer.flush();
    for _ in 0..10 {
        renderer.camera.translate(1.0, 0.0);
        renderer.queue_unstable();
        let _ = renderer.flush();
    }
}

fn run_pan_pass(renderer: &mut cg::runtime::scene::Renderer, frames: u32) -> PanStats {
    let pan_start = Instant::now();
    let mut frame_times = Vec::with_capacity(frames as usize);
    let mut draw_us_acc = Vec::with_capacity(frames as usize);
    let mut mid_flush_us_acc = Vec::with_capacity(frames as usize);
    let mut compositor_us_acc = Vec::with_capacity(frames as usize);
    let mut flush_us_acc = Vec::with_capacity(frames as usize);

    for i in 0..frames {
        let dx = if i % 2 == 0 { 5.0 } else { -5.0 };
        renderer.camera.translate(dx, 0.0);
        renderer.queue_unstable();
        let t = Instant::now();
        if let FrameFlushResult::OK(stats) = renderer.flush() {
            frame_times.push(t.elapsed().as_micros() as u64);
            draw_us_acc.push(stats.draw.painter_duration.as_micros() as u64);
            mid_flush_us_acc.push(stats.mid_flush_duration.as_micros() as u64);
            compositor_us_acc.push(stats.compositor_duration.as_micros() as u64);
            flush_us_acc.push(stats.flush_duration.as_micros() as u64);
        }
    }
    let pan_wall = pan_start.elapsed();

    if frame_times.is_empty() {
        return PanStats {
            avg_us: 0, fps: 0.0, p50_us: 0, p95_us: 0, p99_us: 0,
            draw_us: 0, mid_flush_us: 0, compositor_us: 0, flush_us: 0,
        };
    }

    frame_times.sort();
    let n = frame_times.len();
    let avg = pan_wall.as_micros() as u64 / n as u64;
    PanStats {
        avg_us: avg,
        fps: 1_000_000.0 / avg as f64,
        p50_us: frame_times[n / 2],
        p95_us: frame_times[n * 95 / 100],
        p99_us: frame_times[n * 99 / 100],
        draw_us: draw_us_acc.iter().sum::<u64>() / n as u64,
        mid_flush_us: mid_flush_us_acc.iter().sum::<u64>() / n as u64,
        compositor_us: compositor_us_acc.iter().sum::<u64>() / n as u64,
        flush_us: flush_us_acc.iter().sum::<u64>() / n as u64,
    }
}

fn run_zoom_pass(renderer: &mut cg::runtime::scene::Renderer, frames: u32) -> ZoomStats {
    renderer.camera.set_zoom(1.0);
    let zoom_start = Instant::now();
    let mut zoom_times = Vec::with_capacity(frames as usize);
    let mut z = 1.0f32;
    let mut zdir = 1;

    for _ in 0..frames {
        z += zdir as f32 * 0.02;
        if z > 2.0 || z < 0.5 {
            zdir = -zdir;
        }
        renderer.camera.set_zoom(z);
        renderer.queue_unstable();
        let t = Instant::now();
        if let FrameFlushResult::OK(_) = renderer.flush() {
            zoom_times.push(t.elapsed().as_micros() as u64);
        }
    }
    let zoom_wall = zoom_start.elapsed();

    if zoom_times.is_empty() {
        return ZoomStats { avg_us: 0, fps: 0.0, p50_us: 0, p95_us: 0, p99_us: 0 };
    }

    zoom_times.sort();
    let n = zoom_times.len();
    let avg = zoom_wall.as_micros() as u64 / n as u64;
    ZoomStats {
        avg_us: avg,
        fps: 1_000_000.0 / avg as f64,
        p50_us: zoom_times[n / 2],
        p95_us: zoom_times[n * 95 / 100],
        p99_us: zoom_times[n * 99 / 100],
    }
}

fn collect_grida_files(path: &Path) -> Vec<PathBuf> {
    if path.is_file() {
        return vec![path.to_path_buf()];
    }
    let mut files = Vec::new();
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                walk(&p, out);
            } else if p.extension().map(|e| e == "grida").unwrap_or(false) {
                out.push(p);
            }
        }
    }
    walk(path, &mut files);
    files.sort();
    files
}

fn build_benchmark_scene(grid: u32) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let grid = grid.max(1);
    let size = 18.0f32;
    let spacing = 6.0f32;

    for y in 0..grid {
        for x in 0..grid {
            let mut rect = nf.create_rectangle_node();
            rect.transform = AffineTransform::new(
                40.0 + x as f32 * (size + spacing),
                40.0 + y as f32 * (size + spacing),
                0.0,
            );
            rect.size = Size {
                width: size,
                height: size,
            };
            rect.fills = Paints::new([Paint::Solid(SolidPaint {
                color: CGColor::from_rgb(((x * 11) % 255) as u8, ((y * 7) % 255) as u8, 210),
                blend_mode: BlendMode::default(),
                active: true,
            })]);
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }

    Scene {
        name: format!("Benchmark {}x{}", grid, grid),
        graph,
        background_color: Some(CGColor::from_rgb(250, 250, 250)),
    }
}

// ---------------------------------------------------------------------------
// Single-scene bench (human-readable output)
// ---------------------------------------------------------------------------

pub async fn run_bench(
    args: BenchArgs,
    load_scenes: impl AsyncSceneLoader,
) -> Result<()> {
    let scenes = if let Some(ref path) = args.path {
        load_scenes.load(path).await?
    } else {
        vec![build_benchmark_scene(args.size)]
    };

    if args.list_scenes {
        println!("Available scenes ({}):", scenes.len());
        for (i, s) in scenes.iter().enumerate() {
            println!("  [{}] {} ({} nodes)", i, s.name, s.graph.node_count());
        }
        return Ok(());
    }

    if args.scene_index >= scenes.len() {
        return Err(anyhow!(
            "scene index {} out of range (0..{}). Use --list-scenes.",
            args.scene_index,
            scenes.len()
        ));
    }

    let scene = scenes.into_iter().nth(args.scene_index).unwrap();
    let node_count = scene.graph.node_count();

    let mut gpu = HeadlessGpu::new(args.width, args.height)
        .map_err(|e| anyhow!("GPU init failed: {e}"))?;
    gpu.print_gl_info();

    let mut renderer = gpu.create_renderer();
    renderer.load_scene(scene);
    renderer.fit_camera_to_scene();

    let cam_rect = renderer.camera.rect();
    println!("Loaded scene: {} nodes", node_count);
    println!(
        "Camera: zoom={:.4} viewport=({:.0}x{:.0})",
        renderer.camera.get_zoom(),
        cam_rect.width,
        cam_rect.height,
    );
    println!(
        "Viewport: {}x{}, frames: {}\n",
        args.width, args.height, args.frames
    );

    warmup(&mut renderer);

    let effects_count = count_effects_nodes(&renderer);
    let comp_stats = renderer.get_cache().compositor.stats();
    println!(
        "Nodes with effects: {}  Compositor: {} promoted, {:.1} KB",
        effects_count,
        comp_stats.promoted_count,
        comp_stats.memory_bytes as f64 / 1024.0,
    );

    // --- Pan ---
    println!("=== Pan benchmark ({} frames) ===", args.frames);
    let pan = run_pan_pass(&mut renderer, args.frames);
    println!("  avg: {:>7} us ({:>6.1} fps)", pan.avg_us, pan.fps);
    println!(
        "  p50: {:>7} us  p95: {:>7} us  p99: {:>7} us",
        pan.p50_us, pan.p95_us, pan.p99_us
    );
    println!(
        "  draw: {} us  mid_flush(draw GPU): {} us  compositor: {} us  end_flush: {} us",
        pan.draw_us, pan.mid_flush_us, pan.compositor_us, pan.flush_us
    );

    // --- Zoom ---
    println!("\n=== Zoom benchmark ({} frames) ===", args.frames);
    let zoom = run_zoom_pass(&mut renderer, args.frames);
    println!(
        "  avg: {:>7} us ({:>6.1} fps)  p50: {:>7} us  p95: {:>7} us",
        zoom.avg_us, zoom.fps, zoom.p50_us, zoom.p95_us
    );

    drop(renderer);
    println!("\nDone.");
    Ok(())
}

// ---------------------------------------------------------------------------
// Bulk bench-report (JSON output)
// ---------------------------------------------------------------------------

pub async fn run_bench_report(
    args: BenchReportArgs,
    load_scenes: impl AsyncSceneLoader,
) -> Result<()> {
    let input_path = Path::new(&args.path);
    if !input_path.exists() {
        return Err(anyhow!("path not found: {}", args.path));
    }

    let files = collect_grida_files(input_path);
    if files.is_empty() {
        return Err(anyhow!("no .grida files found in {}", args.path));
    }

    eprintln!(
        "bench-report: {} files, {} frames/pass, {}x{} viewport",
        files.len(), args.frames, args.width, args.height
    );

    let mut results = Vec::new();
    let mut errors = Vec::new();

    for (fi, file_path) in files.iter().enumerate() {
        let file_str = file_path.to_string_lossy().to_string();
        eprintln!("[{}/{}] {}", fi + 1, files.len(), file_str);

        let scenes = match load_scenes.load(&file_str).await {
            Ok(s) => s,
            Err(e) => {
                errors.push(BenchError {
                    file: file_str,
                    error: format!("{e}"),
                });
                continue;
            }
        };

        for (si, scene) in scenes.into_iter().enumerate() {
            let node_count = scene.graph.node_count();
            let scene_name = scene.name.clone();
            eprintln!("  scene[{}] \"{}\" ({} nodes)", si, scene_name, node_count);

            let mut gpu = match HeadlessGpu::new(args.width, args.height) {
                Ok(g) => g,
                Err(e) => {
                    errors.push(BenchError {
                        file: file_str.clone(),
                        error: format!("GPU init failed for scene {si}: {e}"),
                    });
                    continue;
                }
            };

            let mut renderer = gpu.create_renderer();
            renderer.load_scene(scene);
            renderer.fit_camera_to_scene();
            warmup(&mut renderer);

            let effects_count = count_effects_nodes(&renderer);
            let pan = run_pan_pass(&mut renderer, args.frames);
            let zoom = run_zoom_pass(&mut renderer, args.frames);

            drop(renderer);

            results.push(SceneBenchResult {
                file: file_str.clone(),
                scene: scene_name,
                scene_index: si,
                nodes: node_count,
                effects_nodes: effects_count,
                pan,
                zoom,
            });
        }
    }

    let report = BenchReportOutput {
        meta: BenchReportMeta {
            frames: args.frames,
            viewport: [args.width, args.height],
            files_count: files.len(),
            scenes_count: results.len(),
        },
        results,
        errors,
    };

    let json = serde_json::to_string_pretty(&report)?;

    if let Some(ref out_path) = args.output {
        std::fs::write(out_path, &json)?;
        eprintln!("report written to {out_path}");
    } else {
        println!("{json}");
    }

    eprintln!("bench-report done.");
    Ok(())
}

// ---------------------------------------------------------------------------
// Scene loading trait — decouples bench module from main.rs file loading
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait AsyncSceneLoader {
    async fn load(&self, source: &str) -> Result<Vec<Scene>>;
}
