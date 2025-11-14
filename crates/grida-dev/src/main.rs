use anyhow::{anyhow, Context, Result};
use cg::cg::prelude::*;
use cg::helpers::webfont_helper::{find_font_files, load_webfonts_metadata};
use cg::io::{io_figma::FigmaConverter, io_grida};
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::{Node, Scene, Size};
use cg::resources::{load_font, load_scene_images, FontMessage};
use cg::svg::pack;
use cg::window::application::{HostEvent, HostEventCallback};
use clap::{Args, Parser, Subcommand};
use figma_api::apis::{
    configuration::{ApiKey, Configuration},
    files_api::{get_file, get_image_fills},
};
use futures::future::join_all;
use grida_dev::platform::native_demo::{run_demo_window, run_demo_window_with};
use math2::transform::AffineTransform;
use reqwest;
use serde_json;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::fs as async_fs;

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
    /// Load a scene from Figma (API, archive, or local JSON export).
    Figma(FigmaArgs),
    /// Convert and render an SVG.
    Svg(SvgArgs),
    /// Generate a synthetic benchmark grid.
    Benchmark {
        /// Grid dimension (renders N x N rectangles).
        #[arg(long = "size", default_value_t = 400)]
        size: u32,
    },
    /// Render the built-in sample scene.
    Sample,
}

#[derive(Args, Debug)]
struct SceneArgs {
    /// Path or URL to a `.grida` / JSON scene.
    path: String,
}

#[derive(Args, Debug, Clone)]
struct FigmaArgs {
    #[arg(long = "file-key")]
    file_key: Option<String>,
    #[arg(long = "api-key")]
    api_key: Option<String>,
    #[arg(long = "scene-index", default_value_t = 0)]
    scene_index: usize,
    #[arg(long = "no-image", default_value_t = false)]
    no_image: bool,
    #[arg(long = "file")]
    file: Option<String>,
    #[arg(long = "images")]
    images_dir: Option<String>,
    #[arg(long = "archive-dir")]
    archive_dir: Option<String>,
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
        Command::Figma(args) => run_figma(args).await?,
        Command::Svg(args) => run_svg(args).await?,
        Command::Benchmark { size } => {
            run_demo_window(build_benchmark_scene(size)).await;
        }
        Command::Sample => {
            run_demo_window(build_sample_scene()).await;
        }
    }
    Ok(())
}

async fn run_scene(source: &str) -> Result<()> {
    let scene = load_scene_from_source(source).await?;
    run_demo_window(scene).await;
    Ok(())
}

async fn run_figma(args: FigmaArgs) -> Result<()> {
    let (scene, converter) = load_figma_scene(&args).await?;

    println!("Rendering scene: {}", scene.name);
    println!("Number of roots: {}", scene.graph.roots().len());
    println!("Total nodes in graph: {}", scene.graph.node_count());

    let webfonts_metadata = load_webfonts_metadata().await.map_err(|err| anyhow!(err))?;
    let font_files = find_font_files(&webfonts_metadata, &converter.get_discovered_fonts());
    println!("\nFound {} matching font files:", font_files.len());
    for font_file in &font_files {
        println!("Font: {} ({})", font_file.family, font_file.postscript_name);
        println!("  Style: {}", font_file.style);
        println!("  URL: {}", font_file.url);
        println!();
    }

    let scene_for_loader = scene.clone();
    let font_files_for_loader = font_files.clone();
    let figma_args = args.clone();

    run_demo_window_with(scene, move |_renderer, tx, font_tx, proxy| {
        println!("📸 Initializing image loader...");
        let should_load_images = !figma_args.no_image
            && (figma_args.file.is_none()
                || figma_args.images_dir.is_some()
                || figma_args.archive_dir.is_some());
        if should_load_images {
            println!("🔄 Starting to load scene images in background...");
            let scene_for_images = scene_for_loader.clone();
            let tx_clone = tx.clone();
            let image_event_cb: HostEventCallback = {
                let proxy_clone = proxy.clone();
                Arc::new(move |event: HostEvent| {
                    let _ = proxy_clone.send_event(event);
                })
            };
            tokio::spawn(async move {
                load_scene_images(&scene_for_images, tx_clone, image_event_cb).await;
                println!("✅ Scene images loading completed in background");
            });
        } else {
            if figma_args.no_image {
                println!("⏭️ Skipping image loading as --no-image flag is set");
            } else if figma_args.file.is_some()
                && figma_args.images_dir.is_none()
                && figma_args.archive_dir.is_none()
            {
                println!(
                    "⏭️ Skipping image loading (local file without --images directory or --archive-dir)"
                );
            }
        }

        println!("📝 Initializing font loader...");
        println!("🔄 Starting to load scene fonts in background...");
        let font_files_clone = font_files_for_loader.clone();
        let font_tx_clone = font_tx.clone();
        let font_event_cb: HostEventCallback = {
            let proxy_clone = proxy.clone();
            Arc::new(move |event: HostEvent| {
                let _ = proxy_clone.send_event(event);
            })
        };
        tokio::spawn(async move {
            let futures: Vec<_> = font_files_clone
                .into_iter()
                .map(|font_file| {
                    let font_tx = font_tx_clone.clone();
                    let event_cb = font_event_cb.clone();
                    async move {
                        let family = font_file.family;
                        let url = font_file.url;
                        let postscript_name = font_file.postscript_name;
                        println!("Loading font: {} ({})", family, postscript_name);
                        if let Ok(data) = load_font(&url).await {
                            let msg = FontMessage {
                                family: family.clone(),
                                style: None,
                                data: data.clone(),
                            };
                            let _ = font_tx.unbounded_send(msg.clone());
                            event_cb(HostEvent::FontLoaded(msg));
                            println!("✅ Font loaded: {} ({})", family, postscript_name);
                        }
                    }
                })
                .collect();
            join_all(futures).await;
            println!("✅ Scene fonts loading completed in background");
        });
    })
    .await;

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
        .or(Some(CGColor(0xF8, 0xF8, 0xF8, 0xFF)));

    let scene = Scene {
        name: scene_name,
        graph,
        background_color,
    };

    run_demo_window(scene).await;
    Ok(())
}

async fn load_scene_from_source(source: &str) -> Result<Scene> {
    let data = if is_url(source) {
        reqwest::get(source)
            .await
            .with_context(|| format!("failed to download scene from {source}"))?
            .text()
            .await
            .context("failed to read downloaded scene body")?
    } else {
        async_fs::read_to_string(source)
            .await
            .with_context(|| format!("failed to read scene file at {source}"))?
    };

    let file =
        io_grida::parse(&data).context("failed to parse scene JSON. expected a `.grida` export")?;

    let mut converter = cg::io::id_converter::IdConverter::new();
    converter
        .convert_json_canvas_file(file)
        .map_err(|err| anyhow!(err))
}

async fn load_figma_scene(args: &FigmaArgs) -> Result<(Scene, FigmaConverter)> {
    let file = if let Some(archive_dir) = args.archive_dir.as_deref() {
        let archive_path = Path::new(archive_dir);
        if !archive_path.exists() {
            anyhow::bail!("Archive directory does not exist: {archive_dir}");
        }
        if !archive_path.is_dir() {
            anyhow::bail!("Archive path is not a directory: {archive_dir}");
        }

        let document_path = archive_path.join("document.json");
        if !document_path.exists() {
            anyhow::bail!("Required document.json not found in archive: {archive_dir}");
        }

        let file_content = fs::read_to_string(&document_path)
            .with_context(|| format!("failed to read {}", document_path.display()))?;
        serde_json::from_str(&file_content)
            .with_context(|| format!("failed to parse {}", document_path.display()))?
    } else if let Some(file_path) = args.file.as_deref() {
        let file_content =
            fs::read_to_string(file_path).with_context(|| format!("failed to read {file_path}"))?;
        serde_json::from_str(&file_content)
            .with_context(|| format!("failed to parse {file_path}"))?
    } else {
        let file_key = args.file_key.as_deref().ok_or_else(|| {
            anyhow!("file-key is required when not using --file or --archive-dir")
        })?;
        let api_key = args
            .api_key
            .as_deref()
            .ok_or_else(|| anyhow!("api-key is required when not using --file or --archive-dir"))?;

        let configuration = create_figma_configuration(api_key);
        get_file(
            &configuration,
            file_key,
            None,
            None,
            None,
            Some("paths"),
            None,
            None,
        )
        .await?
    };

    let images = load_scene_images_from_source(args).await?;
    let mut converter = FigmaConverter::new().with_image_urls(images);

    let document = converter
        .convert_document(&file.document)
        .map_err(|err| anyhow!(err))?;

    let scene = document
        .get(args.scene_index)
        .cloned()
        .ok_or_else(|| anyhow!("scene-index {} out of bounds", args.scene_index))?;

    Ok((scene, converter))
}

async fn load_scene_images_from_source(args: &FigmaArgs) -> Result<HashMap<String, String>> {
    if args.no_image {
        println!("Skipping image loading (--no-image flag)");
        return Ok(HashMap::new());
    }

    if let Some(archive_dir) = args.archive_dir.as_deref() {
        let images_path = Path::new(archive_dir).join("images");
        if images_path.exists() && images_path.is_dir() {
            let mut images = HashMap::new();
            for entry in fs::read_dir(&images_path)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() {
                    let key = path
                        .file_stem()
                        .ok_or_else(|| anyhow!("invalid filename: {:?}", path))?
                        .to_string_lossy()
                        .to_string();
                    let url = path.to_string_lossy().to_string();
                    images.insert(key, url);
                }
            }
            println!("Loaded {} images from archive directory", images.len());
            return Ok(images);
        } else {
            println!("No images directory found in archive, skipping image loading");
            return Ok(HashMap::new());
        }
    }

    if let Some(images_dir) = args.images_dir.as_deref() {
        let mut images = HashMap::new();
        for entry in fs::read_dir(images_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                let key = path
                    .file_stem()
                    .ok_or_else(|| anyhow!("invalid filename: {:?}", path))?
                    .to_string_lossy()
                    .to_string();
                let url = path.to_string_lossy().to_string();
                images.insert(key, url);
            }
        }
        println!("Loaded {} images from directory", images.len());
        return Ok(images);
    }

    if args.file.is_some() {
        println!("Skipping image loading (local file without --images directory)");
        return Ok(HashMap::new());
    }

    let file_key = args
        .file_key
        .as_deref()
        .ok_or_else(|| anyhow!("file-key is required when not using --file or --archive-dir"))?;
    let api_key = args
        .api_key
        .as_deref()
        .ok_or_else(|| anyhow!("api-key is required when not using --file or --archive-dir"))?;

    println!("Loading images from Figma API");
    let configuration = create_figma_configuration(api_key);
    let images_response = get_image_fills(&configuration, file_key).await?;
    Ok(images_response.meta.images)
}

fn create_figma_configuration(api_key: &str) -> Configuration {
    Configuration {
        base_path: "https://api.figma.com".to_string(),
        user_agent: None,
        client: reqwest::Client::new(),
        basic_auth: None,
        oauth_access_token: None,
        bearer_access_token: None,
        api_key: Some(ApiKey {
            key: api_key.to_string(),
            prefix: None,
        }),
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
        color: CGColor(74, 108, 247, 255),
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
        color: CGColor(253, 158, 115, 255),
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
        color: CGColor(34, 34, 34, 255),
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
        background_color: Some(CGColor(245, 246, 255, 255)),
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
                color: CGColor(((x * 11) % 255) as u8, ((y * 7) % 255) as u8, 210, 255),
                blend_mode: BlendMode::default(),
                active: true,
            })]);
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }

    Scene {
        name: format!("Benchmark {}x{}", grid, grid),
        graph,
        background_color: Some(CGColor(250, 250, 250, 255)),
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
            Some(CGColor(r, g, b, 0xFF))
        }
        8 => {
            let r = u8::from_str_radix(&s[0..2], 16).ok()?;
            let g = u8::from_str_radix(&s[2..4], 16).ok()?;
            let b = u8::from_str_radix(&s[4..6], 16).ok()?;
            let a = u8::from_str_radix(&s[6..8], 16).ok()?;
            Some(CGColor(r, g, b, a))
        }
        _ => None,
    }
}
