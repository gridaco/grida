use anyhow::{anyhow, Context, Result};
use glob::{glob_with, MatchOptions};
use grida::cache::geometry::GeometryCache;
use grida::import::svg::pack;
use grida::runtime::{
    camera::Camera2D,
    font_repository::FontRepository,
    image_repository::ImageRepository,
    scene::{Backend, Renderer, RendererOptions},
};
use math2::rect::Rectangle;
use skia_safe::EncodedImageFormat;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;

pub(crate) struct TestPair {
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
pub(crate) fn find_test_pairs_from_glob(
    base_dir: &Path,
    inputs_glob: &str,
    expects_dir: &Path,
) -> Result<Vec<TestPair>> {
    // Determine the static (literal) root of the glob to compute correct relative paths
    let wc_idx = inputs_glob
        .find(['*', '?', '['])
        .unwrap_or(inputs_glob.len());
    let prefix = &inputs_glob[..wc_idx];
    // Trim to directory boundary (drop any partial segment after the last separator)
    let prefix_root = match prefix.rfind(['/', '\\']) {
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
pub(crate) fn find_test_pairs_in_dirs(svg_dir: &Path, png_dir: &Path) -> Result<Vec<TestPair>> {
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

/// Render an SVG file through `grida::htmlcss::render_svg` (the
/// in-tree htmlcss::svg renderer) and write a PNG.
///
/// Unlike [`render_svg_to_png`], which round-trips through the Grida
/// scene graph via `grida::import::svg::pack`, this path uses our
/// own Skia-backed SVG renderer end-to-end — there is no fallback to
/// Skia's built-in `svg::Dom`. Target size is the reference PNG's
/// pixel dimensions; `viewBox` + `preserveAspectRatio` inside the SVG
/// map user units to that box.
pub(crate) fn render_svg_to_png_via_htmlcss(
    svg_path: &Path,
    output_path: &Path,
    target_size: Option<(u32, u32)>,
) -> Result<()> {
    use skia_safe::{surfaces, Color as SkColor, EncodedImageFormat as SkFmt};

    let svg_source = fs::read_to_string(svg_path)
        .with_context(|| format!("failed to read SVG file {}", svg_path.display()))?;

    // Resolve output size. When the reference PNG dimensions are known,
    // use them; otherwise sniff the SVG root for a `width`/`height` or
    // `viewBox` and fall back to 512×512.
    let (width, height) = match target_size {
        Some((w, h)) => (w.max(1) as i32, h.max(1) as i32),
        None => {
            let (w, h) = sniff_svg_dimensions(&svg_source).unwrap_or((512, 512));
            (w as i32, h as i32)
        }
    };

    // Pre-resolve any relative `xlink:href` / `href` references in the
    // SVG against the fixture's directory so the painter's
    // `ImageProvider` can find them. Without this, fixtures using
    // `<image href="../resources/foo.jpg">` render blank.
    let mut images = grida::htmlcss::PreloadedImages::new();
    let mut css = grida::htmlcss::svg::PreloadedCss::new();
    if let Some(parent) = svg_path.parent() {
        preload_referenced_images(&svg_source, parent, &mut images);
        preload_referenced_css(&svg_source, parent, &mut css);
    }

    // Build a font resolver. For the resvg-test-suite path, this loads
    // the suite's bundled `fonts/` directory and applies the same
    // generic-family map vdiff sets up via `--*-family` flags. Mirrors
    // `--skip-system-fonts`: families not in the curated set return
    // `None` rather than silently falling through to CoreText/fontconfig.
    let fonts = resolve_test_suite_fonts(svg_path);

    // Record the SVG into a Skia Picture via the htmlcss module's
    // resource-aware entry point.
    let context = grida::htmlcss::svg::RenderContext::new(&images, &css, &fonts);
    let picture = grida::htmlcss::svg::render_to_picture_with_context(
        &svg_source,
        width as f32,
        height as f32,
        context,
    )
    .map_err(|e| anyhow!("htmlcss::svg::render_to_picture_with_context failed: {e}"))?;

    // Rasterize the Picture onto a CPU-backed surface. Transparent clear
    // lets the reftest's background masking (`bg = white|black`) composite
    // consistently with the other renderer.
    let mut surface = surfaces::raster_n32_premul((width, height))
        .ok_or_else(|| anyhow!("failed to create raster surface {}x{}", width, height))?;
    {
        let canvas = surface.canvas();
        canvas.clear(SkColor::TRANSPARENT);
        canvas.draw_picture(&picture, None, None);
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, SkFmt::PNG, None)
        .ok_or_else(|| anyhow!("Failed to encode PNG"))?;

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create output directory {}", parent.display()))?;
    }
    fs::write(output_path, data.as_bytes())
        .with_context(|| format!("failed to write PNG to {}", output_path.display()))?;

    Ok(())
}

/// Best-effort extraction of explicit `width="NNN"` / `height="NNN"`
/// attributes from the root `<svg>` element. Used only when no target
/// size is provided. Any non-integer or unit-bearing length falls back
/// to the caller's default; we do not attempt full SVG length resolution
/// here.
fn sniff_svg_dimensions(svg: &str) -> Option<(u32, u32)> {
    let open = svg.find("<svg").map(|i| &svg[i..])?;
    let tag_end = open.find('>')?;
    let tag = &open[..tag_end];
    fn attr(tag: &str, name: &str) -> Option<u32> {
        let needle = format!("{}=", name);
        let start = tag.find(&needle)? + needle.len();
        let rest = &tag[start..];
        let (quote, rest) = rest.split_at(1);
        let quote = quote.chars().next()?;
        if quote != '"' && quote != '\'' {
            return None;
        }
        let end = rest.find(quote)?;
        let raw = &rest[..end];
        let numeric_end = raw
            .find(|c: char| !(c.is_ascii_digit() || c == '.'))
            .unwrap_or(raw.len());
        raw[..numeric_end].parse::<f32>().ok().map(|v| v as u32)
    }
    if let (Some(w), Some(h)) = (attr(tag, "width"), attr(tag, "height")) {
        return Some((w.max(1), h.max(1)));
    }
    // No explicit width/height — derive intrinsic dims from viewBox.
    // Per SVG 2 §5.4 / CSS Images 3 §5, an SVG with only a viewBox has
    // intrinsic dimensions equal to the viewBox extents.
    let vb = sniff_view_box(tag)?;
    Some((vb.0.max(1.0) as u32, vb.1.max(1.0) as u32))
}

fn sniff_view_box(tag: &str) -> Option<(f32, f32)> {
    let needle = "viewBox=";
    let start = tag.find(needle)? + needle.len();
    let rest = &tag[start..];
    let (quote, rest) = rest.split_at(1);
    let quote = quote.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let end = rest.find(quote)?;
    let raw = &rest[..end];
    let parts: Vec<f32> = raw
        .split(|c: char| c == ',' || c.is_ascii_whitespace())
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<f32>().ok())
        .collect();
    if parts.len() == 4 {
        Some((parts[2], parts[3]))
    } else {
        None
    }
}

pub(crate) fn render_svg_to_png(
    svg_path: &Path,
    output_path: &Path,
    target_size: Option<(u32, u32)>,
) -> Result<()> {
    let svg_source = fs::read_to_string(svg_path)
        .with_context(|| format!("failed to read SVG file {}", svg_path.display()))?;

    let graph =
        pack::from_svg_str(&svg_source).map_err(|err| anyhow!("failed to convert SVG: {err}"))?;

    let scene = grida::node::schema::Scene {
        name: svg_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "SVG".to_string()),
        graph,
        background_color: Some(grida::cg::prelude::CGColor::from_u32(0xFFFFFFFF)),
    };

    let store = Arc::new(Mutex::new(grida::resources::ByteStore::new()));
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
        .unwrap_or(Rectangle {
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
        let mut cam = Camera2D::new(grida::node::schema::Size {
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
            ..Default::default()
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

/// Scan an SVG document for `xlink:href="…"` and `href="…"` attribute
/// values that look like local file references, resolve each against
/// the SVG's directory, and pre-decode them into `images`. This makes
/// fixtures using `<image href="../resources/foo.jpg">` (the common
/// resvg-test-suite shape) render correctly through the standalone
/// `render_to_picture_with_images` entry point.
///
/// Excluded: empty values, fragment-only refs (`#id`), and `data:`
/// URIs (the painter decodes those itself).
fn preload_referenced_images(
    svg: &str,
    base_dir: &Path,
    images: &mut grida::htmlcss::PreloadedImages,
) {
    preload_referenced_images_inner(svg, base_dir, images, 0);
}

/// Preload the bodies of any CSS files the SVG `@import`s into a
/// [`grida::htmlcss::svg::PreloadedCss`]. Mirrors `preload_referenced_images`:
/// the renderer's stylesheet collector queries the loader by path
/// during parsing, so the harness's job is just to read every
/// reachable `.css` file from disk and stuff it in.
///
/// Recursive imports (CSS A imports CSS B) are handled by recursing
/// into each loaded file with the *file's own* parent directory as
/// the base, so chained relative paths resolve correctly.
fn preload_referenced_css(svg: &str, base_dir: &Path, css: &mut grida::htmlcss::svg::PreloadedCss) {
    let mut visited: std::collections::HashSet<std::path::PathBuf> =
        std::collections::HashSet::new();
    preload_css_recursive(svg, base_dir, css, &mut visited, 0);
}

/// Cap on the harness preload's recursion depth. Independent of the
/// renderer's `MAX_IMPORT_DEPTH` — the harness side is bounded by the
/// `visited` canonical-path set, this is just a belt against deep
/// chains taking too long to walk on disk.
const MAX_CSS_IMPORT_DEPTH: u32 = 8;

/// Build the font resolver used when rendering a resvg-test-suite
/// fixture. Walks up from the fixture path looking for a sibling
/// `fonts/` directory; if found, registers every `.ttf` / `.otf` and
/// applies the generic-family bindings vdiff configures via `--*-family`
/// flags (see `fixtures/.../tools/vdiff/src/render.cpp`):
///
/// - default + `sans-serif` → `Noto Sans`
/// - `serif` → `Noto Serif`
/// - `cursive` → `Yellowtail`
/// - `fantasy` → `Sedgwick Ave Display`
/// - `monospace` → `Noto Mono`
///
/// When no `fonts/` directory is found, returns an empty resolver —
/// the painter then no-ops on `<text>` rather than silently falling
/// through to system fonts. That matches the suite's
/// `--skip-system-fonts` invariant: any text scoring difference is
/// then attributable to the renderer, not to font availability.
fn resolve_test_suite_fonts(svg_path: &Path) -> grida::htmlcss::svg::PreloadedFonts {
    let mut fonts = grida::htmlcss::svg::PreloadedFonts::new();
    let Some(fonts_dir) = find_test_suite_fonts_dir(svg_path) else {
        return fonts;
    };
    if let Ok(entries) = fs::read_dir(&fonts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_font = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("ttf") || ext.eq_ignore_ascii_case("otf"))
                .unwrap_or(false);
            if !is_font {
                continue;
            }
            if let Ok(bytes) = fs::read(&path) {
                fonts.register(&bytes);
            }
        }
    }
    // Generic-family bindings — verbatim from vdiff's CLI flags.
    //
    // Note: the suite's expected PNGs for `font-family/{cursive,fantasy,
    // serif}.svg` appear to have been rendered against the host's
    // system fallbacks rather than against these vdiff-config fonts.
    // Our render uses the documented Noto Serif / Yellowtail / Sedgwick
    // Ave Display (matching vdiff itself); divergence on those three
    // generic fixtures is a property of the test data, not a wiring
    // bug. `sans-serif` and `monospace` agree on metrics with most
    // host defaults so they score high regardless.
    fonts.set_generic("serif", "Noto Serif");
    fonts.set_generic("sans-serif", "Noto Sans");
    fonts.set_generic("cursive", "Yellowtail");
    fonts.set_generic("fantasy", "Sedgwick Ave Display");
    fonts.set_generic("monospace", "Noto Mono");

    // One fixture (`tspan/style-override.svg`) references "Times New
    // Roman" via inline CSS but the suite ships no matching .ttf. Map
    // it to Noto Serif — the closest registered face — so the fixture
    // renders something rather than blank text. Mirrors the per-host
    // alias hosts get for free on macOS / Windows.
    fonts.set_alias("Times New Roman", "Noto Serif");

    fonts.set_default_family("Noto Sans");
    fonts
}

/// Walk up from `svg_path` looking for a sibling `fonts/` directory
/// (the resvg-test-suite layout has `fonts/` at the suite root, with
/// fixtures nested under `tests/<category>/<name>.svg`). Returns the
/// first hit, or `None` if no ancestor has one.
fn find_test_suite_fonts_dir(svg_path: &Path) -> Option<PathBuf> {
    let mut cursor = svg_path.parent()?;
    loop {
        let candidate = cursor.join("fonts");
        if candidate.is_dir() {
            return Some(candidate);
        }
        cursor = cursor.parent()?;
    }
}

fn preload_css_recursive(
    css_or_svg_text: &str,
    base_dir: &Path,
    css: &mut grida::htmlcss::svg::PreloadedCss,
    visited: &mut std::collections::HashSet<std::path::PathBuf>,
    depth: u32,
) {
    if depth >= MAX_CSS_IMPORT_DEPTH {
        return;
    }
    for path in grida::htmlcss::svg::style::stylesheet::scan_imports(css_or_svg_text) {
        if path.starts_with("http://") || path.starts_with("https://") || path.starts_with("data:")
        {
            continue;
        }
        let resolved = base_dir.join(&path);
        let canonical = resolved.canonicalize().unwrap_or_else(|_| resolved.clone());
        if !visited.insert(canonical.clone()) {
            continue;
        }
        let Ok(body) = fs::read_to_string(&resolved) else {
            continue;
        };
        // Register under the original (unresolved) path the SVG used
        // so the renderer's `CssLoader::get(path)` lookup hits.
        css.insert(path.clone(), body.clone());
        // Recurse — chained imports resolve relative to the imported
        // file's own directory.
        let nested_base = resolved.parent().unwrap_or(base_dir).to_path_buf();
        preload_css_recursive(&body, &nested_base, css, visited, depth + 1);
    }
}

const MAX_NESTED_SVG_DEPTH: u32 = 4;

fn preload_referenced_images_inner(
    svg: &str,
    base_dir: &Path,
    images: &mut grida::htmlcss::PreloadedImages,
    depth: u32,
) {
    use std::collections::HashSet;
    let mut seen: HashSet<String> = HashSet::new();
    for needle in ["xlink:href=\"", "xlink:href='", "href=\"", "href='"] {
        let mut rest = svg;
        while let Some(idx) = rest.find(needle) {
            let after = &rest[idx + needle.len()..];
            let quote = needle.chars().last().unwrap();
            let Some(end) = after.find(quote) else {
                break;
            };
            let value = &after[..end];
            rest = &after[end + 1..];
            if value.is_empty() || value.starts_with('#') {
                continue;
            }
            if value.starts_with("data:") || value.starts_with("DATA:") {
                continue;
            }
            if value.starts_with("http://")
                || value.starts_with("https://")
                || value.starts_with("file://")
            {
                continue;
            }
            if !seen.insert(value.to_string()) {
                continue;
            }
            let path = base_dir.join(value);
            let Ok(bytes) = fs::read(&path) else {
                continue;
            };
            let lower = value.to_ascii_lowercase();
            if lower.ends_with(".svg") {
                if depth >= MAX_NESTED_SVG_DEPTH {
                    continue;
                }
                if let Ok(svg_str) = std::str::from_utf8(&bytes) {
                    if let Some(image) = rasterize_external_svg(svg_str, base_dir, depth + 1) {
                        if let Some(png) = image.encode(None, EncodedImageFormat::PNG, None) {
                            images.insert_bytes(value.to_string(), png.as_bytes());
                        }
                    }
                }
            } else {
                images.insert_bytes(value.to_string(), &bytes);
            }
        }
    }
}

/// Render an external `.svg` file to an in-memory `skia_safe::Image`
/// at its sniffed intrinsic size (or 512×512 fallback). Recursive
/// `<image>` references inside the embedded SVG are resolved against
/// the same `base_dir` as the outer SVG.
fn rasterize_external_svg(svg: &str, base_dir: &Path, depth: u32) -> Option<skia_safe::Image> {
    use skia_safe::{surfaces, Color as SkColor};
    let (w, h) = sniff_svg_dimensions(svg).unwrap_or((512, 512));
    let mut nested = grida::htmlcss::PreloadedImages::new();
    preload_referenced_images_inner(svg, base_dir, &mut nested, depth);
    let picture =
        grida::htmlcss::svg::render_to_picture_with_images(svg, w as f32, h as f32, &nested)
            .ok()?;
    let mut surface = surfaces::raster_n32_premul((w as i32, h as i32))?;
    {
        let canvas = surface.canvas();
        canvas.clear(SkColor::TRANSPARENT);
        canvas.draw_picture(&picture, None, None);
    }
    Some(surface.image_snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preload_css_picks_up_external_import() {
        let svg_path = std::path::Path::new(
            "../../fixtures/local/resvg-test-suite/tests/structure/style/external-CSS.svg",
        );
        let svg = std::fs::read_to_string(svg_path).expect("read fixture");
        let parent = svg_path.parent().unwrap();
        use grida::htmlcss::svg::CssLoader;
        let mut css = grida::htmlcss::svg::PreloadedCss::new();
        preload_referenced_css(&svg, parent, &mut css);
        let body = css
            .get("../../../resources/green.css")
            .expect("imported css preloaded under its original path");
        assert!(
            body.contains("#rect1 { fill:green; }"),
            "imported css body unexpected: {body}"
        );
    }
}
