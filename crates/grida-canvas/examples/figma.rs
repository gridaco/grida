//! Figma Demo - Load and render Figma designs
//!
//! This example demonstrates how to load Figma designs from various sources:
//! - Figma API (requires file-key and api-key)
//! - Local JSON file with optional images directory
//! - Archive directory with structured layout
//!
//! Example usage:
//! ```bash
//! # Load from Figma API
//! cargo run --example figma -- --file-key YOUR_FILE_KEY --api-key YOUR_API_KEY --scene-index 0
//!
//! # Load from local JSON file with images
//! cargo run --example figma -- --file path/to/document.json --images path/to/images --scene-index 0
//!
//! # Load from archive directory (document.json + images/ subdirectory)
//! cargo run --example figma -- --archive-dir path/to/archive --scene-index 0
//!
//! # Skip image loading
//! cargo run --example figma -- --archive-dir path/to/archive --scene-index 0 --no-image
//! ```

use cg::helpers::webfont_helper::{find_font_files, load_webfonts_metadata};
use cg::resource::image_loader::{load_scene_images, ImageLoader};
use cg::resource::FontLoader;
use cg::window;
use cg::{io::io_figma::FigmaConverter, node::schema::Scene};
use clap::Parser;
use figma_api::apis::{
    configuration::{ApiKey, Configuration},
    files_api::{get_file, get_image_fills},
};
use futures::future::join_all;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[arg(long = "file-key")]
    file_key: Option<String>,
    #[arg(long = "api-key")]
    api_key: Option<String>,
    #[arg(long = "scene-index")]
    scene_index: usize,
    #[arg(long = "no-image")]
    no_image: bool,
    #[arg(long = "file")]
    file: Option<String>,
    #[arg(long = "images")]
    images_dir: Option<String>,
    #[arg(long = "archive-dir")]
    archive_dir: Option<String>,
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

async fn load_scene_from_source(
    file_key: Option<&str>,
    api_key: Option<&str>,
    scene_index: usize,
    no_image: bool,
    file_path: Option<&str>,
    images_dir: Option<&str>,
    archive_dir: Option<&str>,
) -> Result<(Scene, FigmaConverter), String> {
    let file = if let Some(archive_dir) = archive_dir {
        // Load from archive directory
        let archive_path = std::path::Path::new(archive_dir);
        if !archive_path.exists() {
            return Err(format!("Archive directory does not exist: {}", archive_dir));
        }
        if !archive_path.is_dir() {
            return Err(format!("Archive path is not a directory: {}", archive_dir));
        }

        let document_path = archive_path.join("document.json");
        if !document_path.exists() {
            return Err(format!(
                "Required document.json not found in archive directory: {}",
                archive_dir
            ));
        }

        let file_content = std::fs::read_to_string(&document_path)
            .map_err(|e| format!("Failed to read document.json from archive: {}", e))?;
        serde_json::from_str(&file_content).map_err(|e| format!("Failed to parse JSON: {}", e))?
    } else if let Some(file_path) = file_path {
        // Load from local file
        let file_content = std::fs::read_to_string(file_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        serde_json::from_str(&file_content).map_err(|e| format!("Failed to parse JSON: {}", e))?
    } else {
        // Load from Figma API
        let file_key =
            file_key.ok_or("file-key is required when not using --file or --archive-dir")?;
        let api_key =
            api_key.ok_or("api-key is required when not using --file or --archive-dir")?;

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
        .await
        .expect("Failed to load file")
    };

    let images = load_scene_images_from_source(
        no_image,
        file_path,
        images_dir,
        archive_dir,
        file_key,
        api_key,
    )
    .await?;

    let mut converter = FigmaConverter::new().with_image_urls(images);

    let document = converter
        .convert_document(&file.document)
        .expect("Failed to convert document");

    Ok((document[scene_index].clone(), converter))
}

async fn load_scene_images_from_source(
    no_image: bool,
    file_path: Option<&str>,
    images_dir: Option<&str>,
    archive_dir: Option<&str>,
    file_key: Option<&str>,
    api_key: Option<&str>,
) -> Result<std::collections::HashMap<String, String>, String> {
    if no_image {
        println!("Skipping image loading (--no-image flag)");
        Ok(std::collections::HashMap::new())
    } else if let Some(archive_dir) = archive_dir {
        // Load images from archive directory's images/ subdirectory
        let images_path = std::path::Path::new(archive_dir).join("images");
        if images_path.exists() && images_path.is_dir() {
            let mut images = std::collections::HashMap::new();
            let dir = std::fs::read_dir(&images_path)
                .map_err(|e| format!("Failed to read images directory: {}", e))?;

            for entry in dir {
                let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
                let path = entry.path();
                if path.is_file() {
                    let key = path
                        .file_stem()
                        .ok_or_else(|| format!("Invalid filename: {:?}", path))?
                        .to_string_lossy()
                        .to_string();
                    let url = path.to_string_lossy().to_string();
                    images.insert(key, url);
                }
            }

            println!("Loaded {} images from archive directory", images.len());
            Ok(images)
        } else {
            println!("No images directory found in archive, skipping image loading");
            Ok(std::collections::HashMap::new())
        }
    } else if let Some(images_dir) = images_dir {
        // Load images from local directory
        let mut images = std::collections::HashMap::new();
        let dir = std::fs::read_dir(images_dir)
            .map_err(|e| format!("Failed to read images directory: {}", e))?;

        for entry in dir {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();
            if path.is_file() {
                let key = path
                    .file_stem()
                    .ok_or_else(|| format!("Invalid filename: {:?}", path))?
                    .to_string_lossy()
                    .to_string();
                let url = path.to_string_lossy().to_string();
                images.insert(key, url);
            }
        }

        println!("Loaded {} images from directory", images.len());
        Ok(images)
    } else if file_path.is_some() {
        // When loading from local file without --images, skip image loading
        println!("Skipping image loading (loading from local file without --images directory)");
        Ok(std::collections::HashMap::new())
    } else {
        // Load from Figma API (only when not loading from local file)
        println!("Loading images from Figma API");
        let file_key =
            file_key.ok_or("file-key is required when not using --file or --archive-dir")?;
        let api_key =
            api_key.ok_or("api-key is required when not using --file or --archive-dir")?;

        let configuration = create_figma_configuration(api_key);

        let images_response = get_image_fills(&configuration, file_key)
            .await
            .expect("Failed to load images");
        Ok(images_response.meta.images)
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let (scene, converter) = load_scene_from_source(
        cli.file_key.as_deref(),
        cli.api_key.as_deref(),
        cli.scene_index,
        cli.no_image,
        cli.file.as_deref(),
        cli.images_dir.as_deref(),
        cli.archive_dir.as_deref(),
    )
    .await
    .expect("Failed to load scene");

    println!("Rendering scene: {}", scene.name);
    println!("Scene ID: {}", scene.id);
    println!("Number of children: {}", scene.children.len());
    println!("Total nodes in repository: {}", scene.nodes.len());

    // Load webfonts metadata and find matching font files
    let webfonts_metadata = load_webfonts_metadata()
        .await
        .expect("Failed to load webfonts metadata");
    let font_files = find_font_files(&webfonts_metadata, &converter.get_discovered_fonts());
    println!("\nFound {} matching font files:", font_files.len());
    for font_file in &font_files {
        println!("Font: {} ({})", font_file.family, font_file.postscript_name);
        println!("  Style: {}", font_file.style);
        println!("  URL: {}", font_file.url);
        println!();
    }

    // Clone the scene before passing it to run_demo_window_with
    let scene_for_window = scene.clone();
    let scene_for_loader = scene;

    // Use the window module's run_demo_window_with to handle image loading and font loading
    window::run_demo_window_with(scene_for_window, |_renderer, tx, font_tx, proxy| {
        // Initialize the image loader in lifecycle mode
        println!("📸 Initializing image loader...");
        let mut image_loader = ImageLoader::new_lifecycle(tx, proxy.clone());

        // Initialize the font loader in lifecycle mode
        println!("📝 Initializing font loader...");
        let font_tx_clone = font_tx.clone();
        let proxy_clone = proxy.clone();

        // Load all images in the scene - non-blocking
        let should_load_images = !cli.no_image && (cli.file.is_none() || cli.images_dir.is_some() || cli.archive_dir.is_some());
        if should_load_images {
            println!("🔄 Starting to load scene images in background...");
            let scene_for_images = scene_for_loader.clone();
            tokio::spawn(async move {
                load_scene_images(&mut image_loader, &scene_for_images).await;
                println!("✅ Scene images loading completed in background");
            });
        } else {
            if cli.no_image {
                println!("⏭️ Skipping image loading as --no-image flag is set");
            } else if cli.file.is_some() && cli.images_dir.is_none() && cli.archive_dir.is_none() {
                println!(
                    "⏭️ Skipping image loading (loading from local file without --images directory or --archive-dir)"
                );
            }
        }

        // Load all fonts in the scene - non-blocking
        println!("🔄 Starting to load scene fonts in background...");
        let font_files_clone = font_files.clone();
        let font_tx = font_tx_clone;
        let proxy = proxy_clone;
        tokio::spawn(async move {
            let font_loading_futures: Vec<_> = font_files_clone
                .into_iter()
                .map(|font_file| {
                    let font_tx = font_tx.clone();
                    let proxy = proxy.clone();
                    async move {
                        let family = font_file.family;
                        let url = font_file.url;
                        let postscript_name = font_file.postscript_name;
                        println!("Loading font: {} ({})", family, postscript_name);
                        let mut font_loader = FontLoader::new_lifecycle(font_tx, proxy);
                        font_loader.load_font(&family, &url).await;
                        println!("✅ Font loaded: {} ({})", family, postscript_name);
                    }
                })
                .collect();

            join_all(font_loading_futures).await;
            println!("✅ Scene fonts loading completed in background");
        });
    })
    .await;
}
