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
use grida_dev::platform::native_demo::{
    run_demo_window, run_demo_window_multi, run_demo_window_with_drop,
};
mod grida_file;
mod reftest;
use image::image_dimensions;
use math2::transform::AffineTransform;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::fs as async_fs;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};
use winit::event_loop::EventLoopProxy;

#[derive(Parser, Debug)]
#[command(
    name = "grida-dev",
    version,
    about = "Rust-native dev runtime for previewing grida-canvas scenes with winit."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Render a `.grida` / JSON scene from disk or URL.
    Scene(SceneArgs),
    /// Convert and render an SVG.
    Svg(SvgArgs),
    /// Generate a synthetic benchmark grid (windowed).
    Benchmark {
        /// Grid dimension (renders N x N rectangles).
        #[arg(long = "size", default_value_t = 400)]
        size: u32,
    },
    /// Headless GPU benchmark — no window, prints per-frame stats.
    /// Accepts either a `.grida` file or `--size N` for a synthetic grid.
    Bench(BenchArgs),
    /// Render the built-in sample scene.
    Sample,
    /// Open an empty scene and replace it when files are dropped onto the window.
    Master,
    /// Run SVG reftests against W3C SVG 1.1 Test Suite.
    Reftest(reftest::ReftestArgs),
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
}

#[derive(Args, Debug)]
struct SceneArgs {
    /// Path or URL to a `.grida` / JSON scene.
    path: String,
}

#[derive(Args, Debug)]
struct SvgArgs {
    /// Path to an SVG file to convert/render.
    path: PathBuf,
    /// Optional scene title.
    #[arg(long = "title")]
    title: Option<String>,
    /// Optional background color in hex (e.g. `#1F1F1F` or `#FFFFFFFF`).
    #[arg(long = "background")]
    background: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Scene(args) => run_scene(&args.path).await?,
        Command::Svg(args) => run_svg(args).await?,
        Command::Benchmark { size } => {
            run_demo_window(build_benchmark_scene(size)).await;
        }
        Command::Sample => {
            run_demo_window(build_sample_scene()).await;
        }
        Command::Bench(args) => run_bench(args).await?,
        Command::Master => run_master().await?,
        Command::Reftest(args) => reftest::run(args).await?,
        #[allow(unreachable_patterns)]
        _ => unreachable!("Unhandled command variant"),
    }
    Ok(())
}

async fn run_bench(args: BenchArgs) -> Result<()> {
    use cg::runtime::scene::FrameFlushResult;
    use cg::window::headless::HeadlessGpu;
    use std::time::Instant;

    let scenes = if let Some(ref path) = args.path {
        load_scenes_from_source(path).await?
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

async fn run_scene(source: &str) -> Result<()> {
    let scenes = load_scenes_from_source(source).await?;
    if scenes.is_empty() {
        return Err(anyhow!("no scenes decoded from source: {source}"));
    }
    if scenes.len() > 1 {
        println!("Loaded {} scenes (PageUp/PageDown to switch)", scenes.len());
        run_demo_window_multi(scenes).await;
    } else {
        run_demo_window(scenes.into_iter().next().unwrap()).await;
    }
    Ok(())
}

async fn run_svg(args: SvgArgs) -> Result<()> {
    let svg_source = async_fs::read_to_string(&args.path)
        .await
        .with_context(|| format!("failed to read SVG file {}", args.path.display()))?;

    let graph =
        pack::from_svg_str(&svg_source).map_err(|err| anyhow!("failed to convert SVG: {err}"))?;

    let scene_name = args.title.unwrap_or_else(|| {
        args.path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "SVG Scene".to_string())
    });

    let background_color = args
        .background
        .as_deref()
        .and_then(parse_hex_color)
        .or(Some(CGColor::from_u32(0xF8F8F8FF)));

    let scene = Scene {
        name: scene_name,
        graph,
        background_color,
    };

    run_demo_window(scene).await;
    Ok(())
}

async fn run_master() -> Result<()> {
    let initial_scene = build_empty_scene();
    let (drop_tx, drop_rx) = unbounded_channel::<PathBuf>();
    let drop_rx = Arc::new(Mutex::new(Some(drop_rx)));

    run_demo_window_with_drop(
        initial_scene,
        move |_renderer, tx, _font_tx, proxy| {
            let mut guard = drop_rx.lock().expect("drop rx mutex poisoned");
            let drop_rx = guard.take().expect("drop receiver already taken");
            start_master_drop_task(drop_rx, tx.clone(), proxy.clone());
        },
        drop_tx,
    )
    .await;

    Ok(())
}

async fn load_scene_from_source(source: &str) -> Result<Scene> {
    let bytes = read_source_bytes(source).await?;
    grida_file::decode(&bytes)
}

async fn load_scenes_from_source(source: &str) -> Result<Vec<Scene>> {
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

fn build_sample_scene() -> Scene {
    let nf = NodeFactory::new();

    let mut hero = nf.create_rectangle_node();
    hero.transform = AffineTransform::new(120.0, 120.0, 0.0);
    hero.size = Size {
        width: 420.0,
        height: 300.0,
    };
    hero.corner_radius = RectangularCornerRadius::circular(32.0);
    hero.fills = Paints::new([Paint::Solid(SolidPaint {
        color: CGColor::from_rgb(74, 108, 247),
        blend_mode: BlendMode::default(),
        active: true,
    })]);

    let mut accent = nf.create_rectangle_node();
    accent.transform = AffineTransform::new(380.0, 260.0, -12.0);
    accent.size = Size {
        width: 220.0,
        height: 120.0,
    };
    accent.corner_radius = RectangularCornerRadius::circular(24.0);
    accent.fills = Paints::new([Paint::Solid(SolidPaint {
        color: CGColor::from_rgb(253, 158, 115),
        blend_mode: BlendMode::default(),
        active: true,
    })]);

    let mut pill = nf.create_rectangle_node();
    pill.transform = AffineTransform::new(200.0, 40.0, 0.0);
    pill.size = Size {
        width: 300.0,
        height: 60.0,
    };
    pill.corner_radius = RectangularCornerRadius::circular(30.0);
    pill.fills = Paints::new([Paint::Solid(SolidPaint {
        color: CGColor::from_rgb(34, 34, 34),
        blend_mode: BlendMode::default(),
        active: true,
    })]);

    let mut graph = SceneGraph::new();
    graph.append_children(
        vec![
            Node::Rectangle(hero),
            Node::Rectangle(accent),
            Node::Rectangle(pill),
        ],
        Parent::Root,
    );

    Scene {
        name: "grida-dev sample".to_string(),
        graph,
        background_color: Some(CGColor::from_rgb(245, 246, 255)),
    }
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

fn is_url(path: &str) -> bool {
    path.starts_with("http://") || path.starts_with("https://")
}

fn parse_hex_color(input: &str) -> Option<CGColor> {
    let s = input.trim().strip_prefix('#').unwrap_or(input.trim());
    match s.len() {
        6 => {
            let r = u8::from_str_radix(&s[0..2], 16).ok()?;
            let g = u8::from_str_radix(&s[2..4], 16).ok()?;
            let b = u8::from_str_radix(&s[4..6], 16).ok()?;
            Some(CGColor::from_rgb(r, g, b))
        }
        8 => {
            let r = u8::from_str_radix(&s[0..2], 16).ok()?;
            let g = u8::from_str_radix(&s[2..4], 16).ok()?;
            let b = u8::from_str_radix(&s[4..6], 16).ok()?;
            let a = u8::from_str_radix(&s[6..8], 16).ok()?;
            Some(CGColor::from_rgba(r, g, b, a))
        }
        _ => None,
    }
}

fn build_empty_scene() -> Scene {
    Scene {
        name: "Drop a file to begin".to_string(),
        graph: SceneGraph::new(),
        background_color: Some(CGColor::from_u32(0xF4F5F7FF)),
    }
}

async fn load_master_scene_from_path(path: &Path) -> Result<Scene> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .ok_or_else(|| anyhow!("Dropped file has no extension: {}", path.display()))?;

    match ext.as_str() {
        "grida" | "json" => load_scene_from_source(&path.to_string_lossy()).await,
        "svg" => scene_from_svg_path(path),
        "png" | "jpg" | "jpeg" | "webp" => scene_from_raster_path(path),
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
) {
    tokio::spawn(async move {
        while let Some(path) = drop_rx.recv().await {
            match load_master_scene_from_path(&path).await {
                Ok(scene) => {
                    let scene_for_loader = scene.clone();
                    if proxy.send_event(HostEvent::LoadScene(scene)).is_err() {
                        panic!("failed to send LoadScene event");
                    }

                    let tx_clone = image_tx.clone();
                    let proxy_clone = proxy.clone();
                    let event_cb: HostEventCallback = Arc::new(move |event: HostEvent| {
                        let _ = proxy_clone.send_event(event);
                    });

                    tokio::spawn(async move {
                        load_scene_images(&scene_for_loader, tx_clone, event_cb).await;
                    });
                }
                Err(err) => panic!("Failed to load dropped file {}: {err}", path.display()),
            }
        }
    });
}
