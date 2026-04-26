//! Golden producer: HTML+CSS → PNG via the `grida::htmlcss` renderer.
//!
//! This is the "actual" side of the reftest pair. The "expected" side
//! is produced by Playwright Chromium (see `.agents/skills/render-reftest/
//! scripts/refbrowser_render.ts`). Both sides write PNGs with
//! transparent backgrounds so pixel alpha doubles as the content
//! mask during diffing.

use crate::suite::{self, ResolvedFixture, SuiteFile};
use grida::htmlcss;
use grida::resources::ByteStore;
use grida::runtime::font_repository::FontRepository;
use skia_safe::{surfaces, Color};
use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// File extensions treated as HTML fixtures by directory-scan mode
/// and URL-stem derivation. Lowercase, no leading dot.
pub const HTML_EXTENSIONS: &[&str] = &["html", "htm", "xht", "xhtml"];

pub fn build_fonts() -> FontRepository {
    let mut repo = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
    repo.enable_system_fallback();
    repo
}

/// Missing files warn once to stderr and contribute nothing to
/// injection (callers skip absent keys silently).
fn ensure_css_cached(cache: &mut HashMap<PathBuf, String>, abs: &Path) {
    if let Entry::Vacant(slot) = cache.entry(abs.to_path_buf()) {
        match std::fs::read_to_string(abs) {
            Ok(s) => {
                slot.insert(s);
            }
            Err(e) => eprintln!("  warn: failed to read {}: {e}", abs.display()),
        }
    }
}

/// Render an HTML string to `{out_dir}/{name}.png`.
pub fn render_to_png(
    html: &str,
    width: f32,
    height: f32,
    name: &str,
    out_dir: &Path,
    fonts: &FontRepository,
) {
    let picture =
        htmlcss::render(html, width, height, fonts, &htmlcss::NoImages).expect("render failed");
    // Full-viewport dims match Chromium's fullPage footprint; transparent clear
    // lets PNG alpha double as the reftest content mask.
    let w = width.max(1.0) as i32;
    let h = height.max(1.0) as i32;

    let mut surface = surfaces::raster_n32_premul((w, h)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::TRANSPARENT);
    canvas.draw_picture(&picture, None, None);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let path = out_dir.join(format!("{name}.png"));
    std::fs::write(&path, data.as_bytes())
        .unwrap_or_else(|e| panic!("failed to write {}: {e}", path.display()));
    eprintln!("  {name}: {w}x{h} → {}", path.display());
}

/// Injects `extras_abs` via `htmlcss::with_extra_stylesheets` so the
/// cascade is symmetric with the refbrowser oracle.
pub fn render_with_extras(
    html_path: &Path,
    extras_abs: &[PathBuf],
    width: f32,
    height: f32,
    out_dir: &Path,
    fonts: &FontRepository,
    css_cache: &mut HashMap<PathBuf, String>,
) {
    let html = match std::fs::read_to_string(html_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("  warn: failed to read {}: {e}", html_path.display());
            return;
        }
    };
    let name = html_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    for abs in extras_abs {
        ensure_css_cached(css_cache, abs);
    }
    let extras: Vec<&str> = extras_abs
        .iter()
        .filter_map(|p| css_cache.get(p).map(String::as_str))
        .collect();
    let html = if extras.is_empty() {
        html
    } else {
        htmlcss::with_extra_stylesheets(&html, &extras)
    };

    render_to_png(&html, width, height, &name, out_dir, fonts);
}

pub fn render_suite(suite_path: &Path, out_dir: &Path, fonts: &FontRepository) {
    let suite: SuiteFile = suite::load(suite_path).unwrap_or_else(|e| panic!("{e}"));
    let suite_dir = suite_path.parent().unwrap_or(Path::new("."));

    eprintln!(
        "Rendering {} fixture(s) from suite {}",
        suite.fixtures.len(),
        suite_path.display()
    );
    let mut css_cache: HashMap<PathBuf, String> = HashMap::new();
    for entry in &suite.fixtures {
        let ResolvedFixture {
            html,
            extra_css,
            width,
            height,
        } = suite::resolve_entry(entry, &suite.defaults, suite_dir);
        render_with_extras(
            &html,
            &extra_css,
            width,
            height,
            out_dir,
            fonts,
            &mut css_cache,
        );
    }
}

/// Renders every file matching [`HTML_EXTENSIONS`] at default
/// viewport dimensions.
pub fn render_directory(dir: &Path, out_dir: &Path, fonts: &FontRepository) {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .expect("failed to read directory")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| HTML_EXTENSIONS.iter().any(|e| e.eq_ignore_ascii_case(ext)))
                .unwrap_or(false)
        })
        .collect();
    entries.sort();

    eprintln!(
        "Rendering {} HTML files from {}",
        entries.len(),
        dir.display()
    );
    let mut css_cache: HashMap<PathBuf, String> = HashMap::new();
    for path in &entries {
        render_with_extras(
            path,
            &[],
            suite::DEFAULT_WIDTH,
            suite::DEFAULT_HEIGHT,
            out_dir,
            fonts,
            &mut css_cache,
        );
    }
}
