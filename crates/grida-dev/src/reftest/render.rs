use anyhow::{Context, Result};
use cg::cache::geometry::GeometryCache;
use cg::runtime::{
    camera::Camera2D,
    font_repository::FontRepository,
    image_repository::ImageRepository,
    scene::{Backend, Renderer, RendererOptions},
};
use cg::svg::pack;
use math2::rect::Rectangle;
use skia_safe::EncodedImageFormat;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;

pub struct TestPair {
    pub svg_path: PathBuf,
    pub ref_png_path: PathBuf,
    pub test_name: String,
}

pub fn find_test_pairs(suite_dir: &Path) -> Result<Vec<TestPair>> {
    let svg_dir = suite_dir.join("svg");
    let png_dir = suite_dir.join("png");

    if !svg_dir.exists() {
        anyhow::bail!("SVG directory not found: {}", svg_dir.display());
    }
    if !png_dir.exists() {
        anyhow::bail!("PNG directory not found: {}", png_dir.display());
    }

    let mut pairs = Vec::new();

    for entry in fs::read_dir(&svg_dir)? {
        let entry = entry?;
        let svg_path = entry.path();

        // Skip .svgz files
        if svg_path.extension().and_then(|e| e.to_str()) == Some("svgz") {
            continue;
        }

        // Only process .svg files
        if svg_path.extension().and_then(|e| e.to_str()) != Some("svg") {
            continue;
        }

        let test_name = svg_path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| anyhow::anyhow!("Invalid SVG filename: {}", svg_path.display()))?
            .to_string();

        let ref_png_path = png_dir.join(format!("{}.png", test_name));

        if ref_png_path.exists() {
            pairs.push(TestPair {
                svg_path,
                ref_png_path,
                test_name,
            });
        }
    }

    Ok(pairs)
}

pub fn render_svg_to_png(svg_path: &Path, output_path: &Path) -> Result<()> {
    // Read SVG file
    let svg_source = fs::read_to_string(svg_path)
        .with_context(|| format!("failed to read SVG file {}", svg_path.display()))?;

    // Convert SVG to Scene
    let graph = pack::from_svg_str(&svg_source)
        .map_err(|err| anyhow::anyhow!("failed to convert SVG: {err}"))?;

    // Create a scene
    let scene = cg::node::schema::Scene {
        name: svg_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("SVG")
            .to_string(),
        graph,
        background_color: Some(cg::cg::prelude::CGColor(0xFF, 0xFF, 0xFF, 0xFF)),
    };

    // Determine render size from scene bounds or use default
    let store = Arc::new(Mutex::new(cg::resources::ByteStore::new()));
    let mut fonts = FontRepository::new(store.clone());
    fonts.register_embedded_fonts();
    let images = ImageRepository::new(store.clone());

    // Get scene bounds
    let geometry = GeometryCache::from_scene(&scene, &fonts);
    let bounds = scene
        .graph
        .roots()
        .iter()
        .filter_map(|id| geometry.get_render_bounds(id))
        .reduce(|acc, rect| math2::rect::union(&[acc, rect]))
        .unwrap_or_else(|| {
            // Default size if no bounds found
            Rectangle {
                x: 0.0,
                y: 0.0,
                width: 800.0,
                height: 600.0,
            }
        });

    let width = bounds.width.max(1.0) as i32;
    let height = bounds.height.max(1.0) as i32;

    // Create headless renderer
    let camera = Camera2D::new_from_bounds(bounds);
    let mut renderer = Renderer::new_with_store(
        Backend::new_from_raster(width, height),
        None,
        camera,
        store.clone(),
        RendererOptions {
            use_embedded_fonts: true,
        },
    );

    renderer.fonts = fonts;
    renderer.images = images;
    renderer.load_scene(scene);

    // Take snapshot
    let image = renderer.snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, None)
        .ok_or_else(|| anyhow::anyhow!("Failed to encode PNG"))?;

    // Clean up
    renderer.free();

    // Ensure output directory exists
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create output directory {}", parent.display()))?;
    }

    fs::write(output_path, data.as_bytes())
        .with_context(|| format!("failed to write PNG to {}", output_path.display()))?;

    Ok(())
}
