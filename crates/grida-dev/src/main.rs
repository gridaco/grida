use anyhow::{anyhow, Context, Result};
use cg::cg::prelude::*;
use cg::cg::types::ResourceRef;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::{Node, Scene, Size};
use cg::resources::{load_scene_images, ImageMessage};
use cg::svg::pack;
use cg::window::application::{HostEvent, HostEventCallback};
use clap::{Args, Parser, Subcommand};
use futures::channel::mpsc;
use grida_dev::platform::native_demo::run_demo_window_with_drop;
mod grida_file;
mod reftest;
use image::image_dimensions;
use math2::transform::AffineTransform;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::fs as async_fs;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use winit::event_loop::EventLoopProxy;

#[derive(Parser, Debug)]
#[command(
    name = "grida-dev",
    version,
    about = "Rust-native dev runtime for previewing grida-canvas scenes with winit.\n\n\
             Opens an interactive window. Optionally pass a file path or URL to load it\n\
             immediately. Drop files onto the window at any time to replace the scene.\n\n\
             Supported formats: .grida, .grida1, .svg, .png, .jpg, .jpeg, .webp"
)]
struct Cli {
    /// File path or URL to load on startup (optional).
    file: Option<String>,

    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Headless GPU benchmark — no window, prints per-frame stats.
    /// Accepts either a `.grida` file or `--size N` for a synthetic grid.
    Bench(BenchArgs),
    /// Run SVG reftests against W3C SVG 1.1 Test Suite.
    Reftest(reftest::ReftestArgs),
    /// Convert SVG files to `.grida` for cross-boundary codec testing.
    /// Output goes to `fixtures/test-svg/.generated/`.
    SvgToGrida(SvgToGridaArgs),
}

#[derive(Args, Debug)]
struct BenchArgs {
    /// Path to a `.grida` file (optional; uses synthetic grid if omitted).
    path: Option<String>,
    /// Grid dimension when no file is given (renders N x N rectangles).
    #[arg(long = "size", default_value_t = 100)]
    size: u32,
    /// Scene index to benchmark (0-based). Use --list-scenes to see available.
    #[arg(long = "scene", default_value_t = 0)]
    scene_index: usize,
    /// List available scene names and exit.
    #[arg(long = "list-scenes", default_value_t = false)]
    list_scenes: bool,
    /// Number of pan frames to measure.
    #[arg(long = "frames", default_value_t = 200)]
    frames: u32,
    /// Viewport width.
    #[arg(long = "width", default_value_t = 1000)]
    width: i32,
    /// Viewport height.
    #[arg(long = "height", default_value_t = 1000)]
    height: i32,
    /// Layer opacity for synthetic shapes (0.0–1.0). Default: 1.0 (opaque).
    #[arg(long = "opacity", default_value_t = 1.0)]
    opacity: f32,
    /// Blend mode: "passthrough" or "normal". Default: passthrough.
    #[arg(long = "blend", default_value = "passthrough")]
    blend: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Some(Command::Bench(args)) => run_bench(args).await?,
        Some(Command::Reftest(args)) => reftest::run(args).await?,
        Some(Command::SvgToGrida(args)) => run_svg_to_grida(args),
        None => run_interactive(cli.file).await?,
    }
    Ok(())
}

#[derive(Args, Debug)]
struct SvgToGridaArgs {
    /// Input directory containing SVG files. Defaults to `fixtures/test-svg/L0`.
    path: Option<String>,
    /// Recurse into subdirectories.
    #[arg(short, long)]
    recursive: bool,
    /// Maximum number of SVGs to process.
    #[arg(short = 'n', long)]
    limit: Option<usize>,
    /// Output directory. Defaults to `fixtures/test-svg/.generated`.
    #[arg(short, long)]
    output: Option<String>,
}

fn run_svg_to_grida(args: SvgToGridaArgs) {
    use cg::io::io_svg::svg_to_grida_bytes;
    use std::path::{Path, PathBuf};

    let input_dir = PathBuf::from(
        args.path
            .as_deref()
            .unwrap_or("fixtures/test-svg/L0"),
    );
    let output_dir = PathBuf::from(
        args.output
            .as_deref()
            .unwrap_or("fixtures/test-svg/.generated"),
    );

    assert!(
        input_dir.exists(),
        "Input directory not found: {}",
        input_dir.display()
    );
    std::fs::create_dir_all(&output_dir).expect("create output dir");

    fn collect_svgs(dir: &Path, recursive: bool, out: &mut Vec<PathBuf>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && recursive {
                collect_svgs(&path, true, out);
            } else if path.extension().map(|e| e == "svg").unwrap_or(false) {
                out.push(path);
            }
        }
    }

    let mut svgs = Vec::new();
    collect_svgs(&input_dir, args.recursive, &mut svgs);
    svgs.sort();
    if let Some(n) = args.limit {
        svgs.truncate(n);
    }

    eprintln!(
        "Processing {} SVGs from {}",
        svgs.len(),
        input_dir.display()
    );

    let mut ok = 0u32;
    let mut skip = 0u32;
    for path in &svgs {
        let name = path.file_stem().unwrap().to_string_lossy();
        let svg = match std::fs::read_to_string(path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("  SKIP {} — read: {}", name, e);
                skip += 1;
                continue;
            }
        };
        match svg_to_grida_bytes(&svg) {
            Ok(bytes) => {
                let out = output_dir.join(format!("{}.grida", name));
                std::fs::write(&out, &bytes).expect("write");
                ok += 1;
            }
            Err(e) => {
                eprintln!("  SKIP {} — {}", name, e);
                skip += 1;
            }
        }
    }
    println!(
        "\n{} converted, {} skipped → {}",
        ok, skip, output_dir.display()
    );
}

async fn run_bench(args: BenchArgs) -> Result<()> {
    use cg::runtime::scene::FrameFlushResult;
    use cg::window::headless::HeadlessGpu;
    use std::time::Instant;

    let bench_blend = match args.blend.as_str() {
        "normal" => LayerBlendMode::Blend(BlendMode::Normal),
        _ => LayerBlendMode::default(), // PassThrough
    };

    let scenes = if let Some(ref path) = args.path {
        load_scenes_from_source(path).await?
    } else {
        vec![build_benchmark_scene(args.size, args.opacity, bench_blend)]
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

    // Fit camera so all content is visible — same as windowed demo.
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

    // Warm up: stable frame first (populates compositor cache), then
    // unstable pan frames to fill picture/geometry caches.
    renderer.queue_stable();
    let _ = renderer.flush();
    for _ in 0..10 {
        renderer.camera.translate(1.0, 0.0);
        renderer.queue_unstable();
        let _ = renderer.flush();
    }

    // Count nodes with effects for diagnostics.
    let effects_count = renderer
        .scene
        .as_ref()
        .map(|s| {
            s.graph
                .nodes_iter()
                .filter(|(_, node)| match node {
                    cg::node::schema::Node::Rectangle(r) => r.effects.has_expensive_effects(),
                    cg::node::schema::Node::Ellipse(e) => e.effects.has_expensive_effects(),
                    _ => false,
                })
                .count()
        })
        .unwrap_or(0);

    let comp_stats = renderer.get_cache().compositor.stats();
    println!(
        "Nodes with effects: {}  Compositor: {} promoted, {:.1} KB",
        effects_count,
        comp_stats.promoted_count,
        comp_stats.memory_bytes as f64 / 1024.0,
    );

    // --- Pan benchmark ---
    println!("=== Pan benchmark ({} frames) ===", args.frames);
    let pan_start = Instant::now();
    let mut frame_times = Vec::with_capacity(args.frames as usize);
    let mut internal_render_us = Vec::with_capacity(args.frames as usize);
    let mut internal_flush_us = Vec::with_capacity(args.frames as usize);
    let mut internal_draw_us = Vec::with_capacity(args.frames as usize);
    let mut total_dl = 0usize;
    let mut total_live = 0usize;
    let mut total_comp_hits = 0usize;
    let mut internal_compositor_us = Vec::with_capacity(args.frames as usize);
    let mut internal_mid_flush_us = Vec::with_capacity(args.frames as usize);

    for i in 0..args.frames {
        let dx = if i % 2 == 0 { 5.0 } else { -5.0 };
        renderer.camera.translate(dx, 0.0);
        renderer.queue_unstable();
        let frame_start = Instant::now();
        if let FrameFlushResult::OK(stats) = renderer.flush() {
            let ft = frame_start.elapsed();
            frame_times.push(ft);
            internal_render_us.push(stats.total_duration.as_micros() as u64);
            internal_flush_us.push(stats.flush_duration.as_micros() as u64);
            internal_draw_us.push(stats.draw.painter_duration.as_micros() as u64);
            internal_compositor_us.push(stats.compositor_duration.as_micros() as u64);
            internal_mid_flush_us.push(stats.mid_flush_duration.as_micros() as u64);
            total_dl += stats.frame.display_list_size_estimated;
            total_live += stats.draw.live_draw_count;
            total_comp_hits += stats.draw.layer_image_cache_hits;
        }
    }
    let pan_wall = pan_start.elapsed();

    if frame_times.is_empty() {
        return Err(anyhow!(
            "no benchmark samples collected, cannot compute summary"
        ));
    }

    frame_times.sort();
    let n = frame_times.len();
    let p50 = frame_times[n / 2];
    let p95 = frame_times[n * 95 / 100];
    let p99 = frame_times[n * 99 / 100];
    let avg = pan_wall / n as u32;
    let fps = 1_000_000.0 / avg.as_micros() as f64;

    let _avg_render = internal_render_us.iter().sum::<u64>() / n as u64;
    let avg_flush = internal_flush_us.iter().sum::<u64>() / n as u64;
    let avg_draw = internal_draw_us.iter().sum::<u64>() / n as u64;
    let avg_compositor = internal_compositor_us.iter().sum::<u64>() / n as u64;
    let avg_mid_flush = internal_mid_flush_us.iter().sum::<u64>() / n as u64;

    println!(
        "  avg: {:>7} us ({:>6.1} fps)",
        avg.as_micros(),
        fps
    );
    println!(
        "  p50: {:>7} us  p95: {:>7} us  p99: {:>7} us",
        p50.as_micros(),
        p95.as_micros(),
        p99.as_micros()
    );
    println!(
        "  draw: {} us  mid_flush(draw GPU): {} us  compositor: {} us  end_flush: {} us",
        avg_draw, avg_mid_flush, avg_compositor, avg_flush
    );
    println!(
        "  dl: {}  live: {}  comp_hits: {}  wall: {:.1} ms",
        total_dl / n,
        total_live / n,
        total_comp_hits / n,
        pan_wall.as_secs_f64() * 1000.0
    );

    // --- Zoom benchmark ---
    println!("\n=== Zoom benchmark ({} frames) ===", args.frames);
    renderer.camera.set_zoom(1.0);
    let zoom_start = Instant::now();
    let mut zoom_times = Vec::with_capacity(args.frames as usize);
    let mut z = 1.0f32;
    let mut zdir = 1;

    for _ in 0..args.frames {
        z += zdir as f32 * 0.02;
        if z > 2.0 || z < 0.5 {
            zdir = -zdir;
        }
        renderer.camera.set_zoom(z);
        renderer.queue_unstable();
        let frame_start = Instant::now();
        if let FrameFlushResult::OK(_) = renderer.flush() {
            zoom_times.push(frame_start.elapsed());
        }
    }
    let zoom_wall = zoom_start.elapsed();

    zoom_times.sort();
    let zn = zoom_times.len();
    let zp50 = zoom_times[zn / 2];
    let zp95 = zoom_times[zn * 95 / 100];
    let zavg = zoom_wall / zn as u32;
    let zfps = 1_000_000.0 / zavg.as_micros() as f64;

    println!(
        "  avg: {:>7.1} us ({:>6.1} fps)  p50: {:>7.1} us  p95: {:>7.1} us  wall: {:.1} ms",
        zavg.as_micros(),
        zfps,
        zp50.as_micros(),
        zp95.as_micros(),
        zoom_wall.as_secs_f64() * 1000.0
    );

    drop(renderer);
    println!("\nDone.");
    Ok(())
}

async fn run_interactive(file: Option<String>) -> Result<()> {
    // Load initial scenes from the CLI argument (file path or URL), if given.
    let initial_scenes = if let Some(ref source) = file {
        load_scenes_from_source(source).await?
    } else {
        vec![build_empty_scene()]
    };

    let first = initial_scenes
        .first()
        .cloned()
        .expect("at least one scene");

    let (drop_tx, drop_rx) = unbounded_channel::<PathBuf>();
    let (scenes_tx, scenes_rx) = unbounded_channel::<Vec<Scene>>();
    let drop_rx = Arc::new(Mutex::new(Some(drop_rx)));

    // Seed the scenes channel with the initial set so the window picks them
    // up on the first tick (enables PageUp/PageDown for multi-scene files).
    if initial_scenes.len() > 1 {
        let _ = scenes_tx.send(initial_scenes);
    }

    run_demo_window_with_drop(
        first,
        move |_renderer, tx, _font_tx, proxy| {
            let mut guard = drop_rx.lock().expect("drop rx mutex poisoned");
            let drop_rx = guard.take().expect("drop receiver already taken");
            start_master_drop_task(drop_rx, tx.clone(), proxy.clone(), scenes_tx);
        },
        drop_tx,
        scenes_rx,
    )
    .await;

    Ok(())
}

async fn load_scenes_from_source(source: &str) -> Result<Vec<Scene>> {
    // If it looks like a local file with a known extension, route by type.
    if !is_url(source) {
        let path = Path::new(source);
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            match ext.to_ascii_lowercase().as_str() {
                "svg" => return scene_from_svg_path(path).map(|s| vec![s]),
                "png" | "jpg" | "jpeg" | "webp" => {
                    return scene_from_raster_path(path).map(|s| vec![s])
                }
                _ => {} // fall through to grida/json decoding
            }
        }
    }
    let bytes = read_source_bytes(source).await?;
    grida_file::decode_all(&bytes)
}

async fn read_source_bytes(source: &str) -> Result<Vec<u8>> {
    if is_url(source) {
        reqwest::get(source)
            .await
            .with_context(|| format!("failed to download scene from {source}"))?
            .bytes()
            .await
            .context("failed to read downloaded scene body")
            .map(|b| b.to_vec())
    } else {
        async_fs::read(source)
            .await
            .with_context(|| format!("failed to read scene file at {source}"))
    }
}

fn build_benchmark_scene(grid: u32, opacity: f32, blend_mode: LayerBlendMode) -> Scene {
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
            rect.opacity = opacity;
            rect.blend_mode = blend_mode;
            rect.fills = Paints::new([Paint::Solid(SolidPaint {
                color: CGColor::from_rgb(((x * 11) % 255) as u8, ((y * 7) % 255) as u8, 210),
                blend_mode: BlendMode::default(),
                active: true,
            })]);
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }

    Scene {
        name: format!("Benchmark {}x{} (opacity={:.2})", grid, grid, opacity),
        graph,
        background_color: Some(CGColor::from_rgb(250, 250, 250)),
    }
}

fn is_url(path: &str) -> bool {
    path.starts_with("http://") || path.starts_with("https://")
}

fn build_empty_scene() -> Scene {
    Scene {
        name: "Drop a file to begin".to_string(),
        graph: SceneGraph::new(),
        background_color: Some(CGColor::from_u32(0xF4F5F7FF)),
    }
}

async fn load_master_scenes_from_path(path: &Path) -> Result<Vec<Scene>> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .ok_or_else(|| anyhow!("Dropped file has no extension: {}", path.display()))?;

    match ext.as_str() {
        "grida" | "grida1" => load_scenes_from_source(&path.to_string_lossy()).await,
        "svg" => scene_from_svg_path(path).map(|s| vec![s]),
        "png" | "jpg" | "jpeg" | "webp" => scene_from_raster_path(path).map(|s| vec![s]),
        other => Err(anyhow!(
            "Unsupported dropped file type ({}): {}",
            other,
            path.display()
        )),
    }
}

fn scene_from_svg_path(path: &Path) -> Result<Scene> {
    let svg_source =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let graph = pack::from_svg_str(&svg_source)
        .map_err(|err| anyhow!("failed to convert SVG {}: {err}", path.display()))?;

    Ok(Scene {
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "SVG".to_string()),
        graph,
        background_color: Some(CGColor::from_u32(0xF8F8F8FF)),
    })
}

fn scene_from_raster_path(path: &Path) -> Result<Scene> {
    let (width, height) = image_dimensions(path)
        .with_context(|| format!("failed to read image dimensions {}", path.display()))?;
    let mut graph = SceneGraph::new();
    let nf = NodeFactory::new();

    let mut image_node = nf.create_image_node();
    image_node.size = Size {
        width: width as f32,
        height: height as f32,
    };
    image_node.image = ResourceRef::RID(path.to_string_lossy().into_owned());

    graph.append_child(Node::Image(image_node), Parent::Root);

    Ok(Scene {
        name: path
            .file_stem()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Image".to_string()),
        graph,
        background_color: Some(CGColor::from_u32(0xF8F8F8FF)),
    })
}

fn start_master_drop_task(
    mut drop_rx: UnboundedReceiver<PathBuf>,
    image_tx: mpsc::UnboundedSender<ImageMessage>,
    proxy: EventLoopProxy<HostEvent>,
    scenes_tx: UnboundedSender<Vec<Scene>>,
) {
    tokio::spawn(async move {
        while let Some(path) = drop_rx.recv().await {
            match load_master_scenes_from_path(&path).await {
                Ok(scenes) => {
                    let scenes_for_loader = scenes.clone();
                    if scenes_tx.send(scenes).is_err() {
                        eprintln!("failed to send scenes to window");
                        continue;
                    }

                    // Load images for all scenes in the background.
                    for scene in scenes_for_loader {
                        let tx_clone = image_tx.clone();
                        let proxy_clone = proxy.clone();
                        let event_cb: HostEventCallback = Arc::new(move |event: HostEvent| {
                            let _ = proxy_clone.send_event(event);
                        });

                        tokio::spawn(async move {
                            load_scene_images(&scene, tx_clone, event_cb).await;
                        });
                    }
                }
                Err(err) => eprintln!("Failed to load dropped file {}: {err}", path.display()),
            }
        }
    });
}
