use anyhow::{anyhow, Context, Result};
use cg::cache::geometry::GeometryCache;
use cg::runtime::{
    camera::Camera2D,
    font_repository::FontRepository,
    image_repository::ImageRepository,
    scene::{Backend, Renderer, RendererOptions},
};
use cg::svg::pack;
use glob::{glob_with, MatchOptions};
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

fn name_from_rel_path(rel: &Path) -> String {
    // Convert a relative path like `dir/sub/icon.svg` to `dir_sub_icon`
    let mut parts: Vec<String> = Vec::new();
    let components: Vec<String> = rel
        .iter()
        .map(|c| c.to_string_lossy().to_string())
        .collect();
    let last_index = rel.components().count().saturating_sub(1);
    for (i, mut seg) in components.into_iter().enumerate() {
        if i == last_index {
            if let Some(dot) = seg.rfind('.') {
                seg.truncate(dot);
            }
        }
        if !seg.is_empty() {
            parts.push(seg);
        }
    }
    if parts.is_empty() {
        rel.file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "unknown".into())
    } else {
        parts.join("_")
    }
}

/// Find SVG→PNG pairs by matching SVG inputs using a glob pattern relative to `base_dir` and
/// mapping each matched SVG to an expected PNG under `expects_dir` with mirrored relative path.
pub fn find_test_pairs_from_glob(
    base_dir: &Path,
    inputs_glob: &str,
    expects_dir: &Path,
) -> Result<Vec<TestPair>> {
    // Determine the static (literal) root of the glob to compute correct relative paths
    let wc_idx = inputs_glob
        .find(|c: char| matches!(c, '*' | '?' | '['))
        .unwrap_or(inputs_glob.len());
    let prefix = &inputs_glob[..wc_idx];
    // Trim to directory boundary (drop any partial segment after the last separator)
    let prefix_root = match prefix.rfind(|c: char| c == '/' || c == '\\') {
        Some(i) if i > 0 => &prefix[..i],
        Some(_) => "",
        None => prefix,
    };

    let pattern_path = base_dir.join(inputs_glob);
    let pattern = pattern_path.to_string_lossy().to_string();

    let options = MatchOptions {
        case_sensitive: true,
        require_literal_separator: false,
        require_literal_leading_dot: false,
    };

    let mut out: Vec<TestPair> = Vec::new();

    // Base directory to strip from matched paths (suite_dir/prefix_root)
    let strip_base = if prefix_root.is_empty() {
        base_dir.to_path_buf()
    } else {
        base_dir.join(prefix_root)
    };

    for entry in glob_with(&pattern, options)? {
        let path = match entry {
            Ok(p) => p,
            Err(e) => return Err(anyhow!(e)),
        };
        if !path.is_file() {
            continue;
        }
        // Relative path of the SVG under the static root
        let rel = match path.strip_prefix(&strip_base) {
            Ok(r) => r.to_path_buf(),
            Err(_) => PathBuf::from(path.file_name().unwrap_or_default()),
        };
        // expected png: same relative path but .png under expects_dir
        let mut rel_png = rel.clone();
        rel_png.set_extension("png");
        let ref_png_path = expects_dir.join(&rel_png);
        if !ref_png_path.exists() {
            continue;
        }
        let mut rel_no_ext = rel.clone();
        rel_no_ext.set_extension("");
        let test_name = name_from_rel_path(&rel_no_ext);
        out.push(TestPair {
            svg_path: path,
            ref_png_path,
            test_name,
        });
    }

    Ok(out)
}

/// Discover pairs by scanning `svg_dir` for `*.svg` and matching `<name>.png` in `png_dir`.
pub fn find_test_pairs_in_dirs(svg_dir: &Path, png_dir: &Path) -> Result<Vec<TestPair>> {
    if !svg_dir.exists() {
        anyhow::bail!("SVG directory not found: {}", svg_dir.display());
    }
    if !png_dir.exists() {
        anyhow::bail!("PNG directory not found: {}", png_dir.display());
    }

    let mut pairs = Vec::new();
    for entry in fs::read_dir(svg_dir)? {
        let entry = entry?;
        let svg_path = entry.path();
        if svg_path.extension().and_then(|e| e.to_str()) != Some("svg") {
            continue;
        }
        let test_name = svg_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| String::from("unknown"));
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

pub fn render_svg_to_png(
    svg_path: &Path,
    output_path: &Path,
    target_size: Option<(u32, u32)>,
) -> Result<()> {
    let svg_source = fs::read_to_string(svg_path)
        .with_context(|| format!("failed to read SVG file {}", svg_path.display()))?;

    let graph =
        pack::from_svg_str(&svg_source).map_err(|err| anyhow!("failed to convert SVG: {err}"))?;

    let scene = cg::node::schema::Scene {
        name: svg_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "SVG".to_string()),
        graph,
        background_color: Some(cg::cg::prelude::CGColor(0xFF, 0xFF, 0xFF, 0xFF)),
    };

    let store = Arc::new(Mutex::new(cg::resources::ByteStore::new()));
    let mut fonts = FontRepository::new(store.clone());
    fonts.register_embedded_fonts();
    let images = ImageRepository::new(store.clone());

    let geometry = GeometryCache::from_scene(&scene, &fonts);
    let bounds = scene
        .graph
        .roots()
        .iter()
        .filter_map(|id| geometry.get_render_bounds(id))
        .reduce(|acc, rect| math2::rect::union(&[acc, rect]))
        .unwrap_or_else(|| Rectangle {
            x: 0.0,
            y: 0.0,
            width: 800.0,
            height: 600.0,
        });

    // Determine render dimensions: use target size if provided, otherwise use bounds
    let (width, height) = if let Some((target_w, target_h)) = target_size {
        (target_w as i32, target_h as i32)
    } else {
        (bounds.width.max(1.0) as i32, bounds.height.max(1.0) as i32)
    };

    // Create camera with target viewport size
    let camera = if let Some((target_w, target_h)) = target_size {
        // Create camera with target size as viewport, then scale to fit bounds
        let mut cam = Camera2D::new(cg::node::schema::Size {
            width: target_w as f32,
            height: target_h as f32,
        });

        // Calculate zoom to fit bounds into target size
        let zoom_x = (target_w as f32) / bounds.width.max(1.0);
        let zoom_y = (target_h as f32) / bounds.height.max(1.0);
        let zoom = zoom_x.min(zoom_y);

        if zoom.is_finite() && zoom > 0.0 {
            cam.set_zoom(zoom);
        }

        // Center camera on bounds
        let center_x = bounds.x + bounds.width * 0.5;
        let center_y = bounds.y + bounds.height * 0.5;
        cam.set_center(center_x, center_y);

        cam
    } else {
        // No target size, use bounds-based camera
        Camera2D::new_from_bounds(bounds)
    };

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

    let image = renderer.snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, None)
        .ok_or_else(|| anyhow!("Failed to encode PNG"))?;

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create output directory {}", parent.display()))?;
    }

    fs::write(output_path, data.as_bytes())
        .with_context(|| format!("failed to write PNG to {}", output_path.display()))?;

    Ok(())
}
