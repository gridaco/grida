use anyhow::{Context, Result};
use cg::node::schema::Scene;
use cg::resources::{load_scene_images, ImageMessage};
use cg::svg::pack;
use cg::window::application::{HostEvent, HostEventCallback};
use clap::{Parser, Subcommand};
use futures::channel::mpsc;
use grida_dev::platform::native_demo::run_demo_window_with_drop;
mod bench;
mod grida_file;
mod reftest;
use image::image_dimensions;
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
             Supported formats: .grida, .grida1, .svg, .html, .md, .png, .jpg, .jpeg, .webp"
)]
struct Cli {
    /// File path or URL to load on startup (optional).
    file: Option<String>,

    /// Enable system font fallback (native only).
    ///
    /// When set, the platform's system font manager is used as a fallback for
    /// glyphs not covered by explicitly loaded fonts. Off by default to match
    /// the WASM/web environment where only provided fonts are available.
    #[arg(long)]
    system_fonts: bool,

    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Headless GPU benchmark — no window, prints per-frame stats.
    /// Accepts either a `.grida` file or `--size N` for a synthetic grid.
    Bench(bench::BenchArgs),
    /// Run SVG reftests against W3C SVG 1.1 Test Suite.
    Reftest(reftest::ReftestArgs),
    /// Convert SVG files to `.grida` for cross-boundary codec testing.
    /// Output goes to `fixtures/test-svg/.generated/`.
    SvgToGrida(SvgToGridaArgs),
    /// Bulk benchmark — runs all scenes in all `.grida` files, outputs a compact JSON report.
    /// Accepts a single `.grida` file or a directory (recursively finds `*.grida` files).
    BenchReport(bench::BenchReportArgs),
    /// Measure `load_scene()` per-stage timings (layout, geometry, effects, layers).
    /// Identifies cold-start bottlenecks without GPU rendering.
    LoadBench(bench::LoadBenchArgs),
    /// Benchmark static image export (PNG/JPEG) for specific nodes.
    /// Measures per-stage timings and supports pixel-exact comparison.
    ExportBench(bench::ExportBenchArgs),
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let loader = FileSceneLoader;
    match cli.command {
        Some(Command::Bench(args)) => bench::run_bench(args, loader).await?,
        Some(Command::Reftest(args)) => reftest::run(args).await?,
        Some(Command::SvgToGrida(args)) => run_svg_to_grida(args),
        Some(Command::BenchReport(args)) => bench::run_bench_report(args, loader).await?,
        Some(Command::LoadBench(args)) => bench::run_load_bench(args, loader).await?,
        Some(Command::ExportBench(args)) => bench::run_export_bench(args, loader).await?,
        None => run_interactive(cli.file, cli.system_fonts).await?,
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Scene loader — bridges main.rs file I/O into the bench module
// ---------------------------------------------------------------------------

struct FileSceneLoader;

impl bench::runner::AsyncSceneLoader for FileSceneLoader {
    async fn load(&self, source: &str) -> Result<Vec<Scene>> {
        load_scenes_from_source(source).await
    }
}

// ---------------------------------------------------------------------------
// SVG-to-Grida converter
// ---------------------------------------------------------------------------

#[derive(clap::Args, Debug)]
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

    let input_dir = PathBuf::from(args.path.as_deref().unwrap_or("fixtures/test-svg/L0"));
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
        ok,
        skip,
        output_dir.display()
    );
}

// ---------------------------------------------------------------------------
// Scene loading helpers (shared by interactive mode and FileSceneLoader)
// ---------------------------------------------------------------------------

async fn load_scenes_from_source(source: &str) -> Result<Vec<Scene>> {
    if !is_url(source) {
        let path = Path::new(source);
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            match ext.to_ascii_lowercase().as_str() {
                "svg" => return scene_from_svg_path(path).map(|s| vec![s]),
                "html" | "htm" => return scene_from_html_path(path).map(|s| vec![s]),
                // Raster images should be loaded via load_raster() by the caller
                // so bytes can be registered with the renderer.
                ext if is_raster_ext(ext) => return load_raster(path).map(|r| vec![r.scene]),
                _ => {}
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

fn is_url(path: &str) -> bool {
    path.starts_with("http://") || path.starts_with("https://")
}

// ---------------------------------------------------------------------------
// Interactive windowed mode
// ---------------------------------------------------------------------------

fn build_empty_scene() -> Scene {
    use cg::cg::prelude::CGColor;
    use cg::node::scene_graph::SceneGraph;
    Scene {
        name: "Drop a file to begin".to_string(),
        graph: SceneGraph::new(),
        background_color: Some(CGColor::from_u32(0xF4F5F7FF)),
    }
}

async fn run_interactive(file: Option<String>, system_fonts: bool) -> Result<()> {
    // Load initial scene(s). For raster images we also capture the raw bytes
    // so we can register them with the renderer once it's ready.
    let mut initial_image: Option<ImageMessage> = None;
    let initial_scenes = if let Some(ref source) = file {
        let path = Path::new(source);
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        if !is_url(source) && is_raster_ext(&ext) {
            let raster = load_raster(path)?;
            initial_image = Some(ImageMessage {
                src: raster.rid,
                data: raster.bytes,
            });
            vec![raster.scene]
        } else {
            load_scenes_from_source(source).await?
        }
    } else {
        vec![build_empty_scene()]
    };

    let first = initial_scenes.first().cloned().expect("at least one scene");

    let (drop_tx, drop_rx) = unbounded_channel::<PathBuf>();
    let (scenes_tx, scenes_rx) = unbounded_channel::<Vec<Scene>>();
    let drop_rx = Arc::new(Mutex::new(Some(drop_rx)));

    if initial_scenes.len() > 1 {
        let _ = scenes_tx.send(initial_scenes);
    }

    let options = cg::runtime::scene::RendererOptions {
        use_embedded_fonts: true,
        use_system_fonts: system_fonts,
        ..Default::default()
    };

    run_demo_window_with_drop(
        first,
        move |_renderer, tx, _font_tx, proxy| {
            // Register initial raster image bytes if present.
            if let Some(msg) = initial_image {
                let _ = tx.unbounded_send(msg.clone());
                let _ = proxy.send_event(HostEvent::ImageLoaded(msg));
            }

            let mut guard = drop_rx.lock().expect("drop rx mutex poisoned");
            let drop_rx = guard.take().expect("drop receiver already taken");
            start_master_drop_task(drop_rx, tx.clone(), proxy.clone(), scenes_tx);
        },
        drop_tx,
        scenes_rx,
        options,
    )
    .await;

    Ok(())
}

fn scene_from_svg_path(path: &Path) -> Result<Scene> {
    use cg::cg::prelude::CGColor;
    let svg_source = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let graph = pack::from_svg_str(&svg_source)
        .map_err(|err| anyhow::anyhow!("failed to convert SVG {}: {err}", path.display()))?;

    Ok(Scene {
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "SVG".to_string()),
        graph,
        background_color: Some(CGColor::from_u32(0xF8F8F8FF)),
    })
}

fn scene_from_html_path(path: &Path) -> Result<Scene> {
    use cg::cg::prelude::CGColor;
    let html_source = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let graph = cg::html::from_html_str(&html_source)
        .map_err(|err| anyhow::anyhow!("failed to convert HTML {}: {err}", path.display()))?;

    Ok(Scene {
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "HTML (Convert)".to_string()),
        graph,
        background_color: Some(CGColor::from_u32(0xFFFFFFFF)),
    })
}

fn scene_from_html_embed_path(path: &Path) -> Result<Scene> {
    use cg::cg::prelude::CGColor;
    use cg::node::factory::NodeFactory;
    use cg::node::scene_graph::{Parent, SceneGraph};
    use cg::node::schema::Node;

    let html_source = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;

    let width = 800.0f32;
    let temp_fonts = {
        use cg::resources::ByteStore;
        use cg::runtime::font_repository::FontRepository;
        let mut repo =
            FontRepository::new(std::sync::Arc::new(std::sync::Mutex::new(ByteStore::new())));
        repo.enable_system_fallback();
        repo
    };
    let height =
        cg::htmlcss::measure_content_height(&html_source, width, &temp_fonts).unwrap_or(600.0);

    let nf = NodeFactory::new();
    let mut node = nf.create_html_embed_node();
    node.html = html_source;
    node.size = cg::node::schema::Size { width, height };

    let mut graph = SceneGraph::new();
    graph.append_child(Node::HTMLEmbed(node), Parent::Root);

    Ok(Scene {
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "HTML (Embed)".to_string()),
        graph,
        background_color: Some(CGColor::from_u32(0xFFFFFFFF)),
    })
}

/// Show a dialog asking the user to choose between Embed and Convert for HTML files.
/// Returns true for Embed, false for Convert.
fn ask_html_import_mode() -> bool {
    use rfd::MessageButtons;
    use rfd::MessageDialog;
    use rfd::MessageDialogResult;

    let result = MessageDialog::new()
        .set_title("HTML Import Mode")
        .set_description("How would you like to import this HTML file?\n\n\u{2022} Embed \u{2014} Render as opaque picture (CSS-accurate, non-editable)\n\u{2022} Convert \u{2014} Convert to editable Grida IR nodes (lossy CSS)")
        .set_buttons(MessageButtons::OkCancelCustom("Embed".to_string(), "Convert".to_string()))
        .show();

    match result {
        MessageDialogResult::Ok => true,
        MessageDialogResult::Custom(s) if s == "Embed" => true,
        _ => false,
    }
}

fn scene_from_markdown_embed_path(path: &Path) -> Result<Scene> {
    use cg::cg::prelude::CGColor;
    use cg::node::factory::NodeFactory;
    use cg::node::scene_graph::{Parent, SceneGraph};
    use cg::node::schema::Node;

    let md_source = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;

    let nf = NodeFactory::new();
    let mut node = nf.create_markdown_embed_node();
    node.markdown = md_source;
    node.width = Some(800.0);
    node.height = None; // auto-height: resolved at layout/geometry time

    let mut graph = SceneGraph::new();
    graph.append_child(Node::MarkdownEmbed(node), Parent::Root);

    Ok(Scene {
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "MarkdownEmbed".to_string()),
        graph,
        background_color: Some(CGColor::from_u32(0xFFFFFFFF)),
    })
}

/// Result of loading a raster image: the scene plus the raw bytes and RID
/// so the caller can register the image with the renderer directly.
struct RasterScene {
    scene: Scene,
    /// Raw image bytes read from disk.
    bytes: Vec<u8>,
    /// The `res://images/{hash}` RID used by the node's fill.
    rid: String,
}

fn load_raster(path: &Path) -> Result<RasterScene> {
    use cg::cg::prelude::CGColor;
    use cg::cg::types::{Paints, ResourceRef};
    use cg::node::factory::NodeFactory;
    use cg::node::scene_graph::{Parent, SceneGraph};
    use cg::node::schema::{Node, Size};
    use cg::resources::hash_bytes;

    let bytes = std::fs::read(path)
        .with_context(|| format!("failed to read image file {}", path.display()))?;
    let (width, height) = image_dimensions(path)
        .with_context(|| format!("failed to read image dimensions {}", path.display()))?;

    let rid = format!("res://images/{:016x}", hash_bytes(&bytes));
    let ref_ = ResourceRef::RID(rid.clone());

    let nf = NodeFactory::new();
    let mut node = nf.create_image_node();
    node.size = Size {
        width: width as f32,
        height: height as f32,
    };
    node.image = ref_.clone();
    node.fill.image = ref_;
    node.strokes = Paints::default();

    let mut graph = SceneGraph::new();
    graph.append_child(Node::Image(node), Parent::Root);

    Ok(RasterScene {
        scene: Scene {
            name: path
                .file_stem()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "Image".to_string()),
            graph,
            background_color: Some(CGColor::from_u32(0xF8F8F8FF)),
        },
        bytes,
        rid,
    })
}

fn is_raster_ext(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "webp")
}

async fn load_master_scenes_from_path(path: &Path) -> Result<Vec<Scene>> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .ok_or_else(|| anyhow::anyhow!("Dropped file has no extension: {}", path.display()))?;

    match ext.as_str() {
        "grida" | "grida1" => load_scenes_from_source(&path.to_string_lossy()).await,
        "svg" => scene_from_svg_path(path).map(|s| vec![s]),
        "html" | "htm" => {
            if ask_html_import_mode() {
                scene_from_html_embed_path(path).map(|s| vec![s])
            } else {
                scene_from_html_path(path).map(|s| vec![s])
            }
        }
        "md" | "markdown" => scene_from_markdown_embed_path(path).map(|s| vec![s]),
        // Raster images are handled separately in start_master_drop_task.
        other => Err(anyhow::anyhow!(
            "Unsupported dropped file type ({}): {}",
            other,
            path.display()
        )),
    }
}

fn start_master_drop_task(
    mut drop_rx: UnboundedReceiver<PathBuf>,
    image_tx: mpsc::UnboundedSender<ImageMessage>,
    proxy: EventLoopProxy<HostEvent>,
    scenes_tx: UnboundedSender<Vec<Scene>>,
) {
    tokio::spawn(async move {
        while let Some(path) = drop_rx.recv().await {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default();

            // Raster images: read bytes, register image, then send scene.
            // No need to go through load_scene_images / extract_image_urls.
            if is_raster_ext(&ext) {
                match load_raster(&path) {
                    Ok(raster) => {
                        // Send image bytes so the renderer registers them.
                        let msg = ImageMessage {
                            src: raster.rid,
                            data: raster.bytes,
                        };
                        let _ = image_tx.unbounded_send(msg.clone());
                        let _ = proxy.send_event(HostEvent::ImageLoaded(msg));

                        if scenes_tx.send(vec![raster.scene]).is_err() {
                            eprintln!("failed to send scene to window");
                        }
                    }
                    Err(err) => {
                        eprintln!("Failed to load dropped image {}: {err}", path.display())
                    }
                }
                continue;
            }

            // Non-raster files: load scenes, then resolve any embedded image refs.
            match load_master_scenes_from_path(&path).await {
                Ok(scenes) => {
                    let scenes_for_loader = scenes.clone();
                    if scenes_tx.send(scenes).is_err() {
                        eprintln!("failed to send scenes to window");
                        continue;
                    }

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
