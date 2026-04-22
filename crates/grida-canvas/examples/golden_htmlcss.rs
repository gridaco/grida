/// HTML+CSS renderer golden test tool.
///
/// Renders HTML files to PNG for visual inspection. Output goes to a
/// temporary directory (printed to stderr) so generated images don't
/// bloat the repository.
///
/// ## Usage
///
///   cargo run -p cg --example golden_htmlcss -- \
///     --suite fixtures/test-html/suites/L0.exact.json
///
///   cargo run -p cg --example golden_htmlcss -- [FILE_OR_DIR...]
///
/// If no arguments given, renders built-in L0 fixtures.
/// If FILE_OR_DIR is given, renders ad-hoc (no sidecar config).
///
/// ## Suite JSON shape
///
///   {
///     "defaults": {
///       "viewport": { "width": 600, "height": 800 },
///       "extra_css": ["../_reftest/hide-text.css"]
///     },
///     "fixtures": [
///       { "path": "../L0/box-dimensions.html",
///         "viewport": { "width": 600, "height": 522 } }
///     ]
///   }
///
/// Per-fixture entries inherit and override `defaults`. All paths
/// (`fixtures[].path`, `extra_css[]`) resolve **relative to the suite
/// file**. `gate` and other fields unknown to this tool are ignored.
use cg::htmlcss;
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use serde::Deserialize;
use skia_safe::{surfaces, Color};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

fn build_fonts() -> FontRepository {
    let mut repo = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
    repo.enable_system_fallback();
    repo
}

#[derive(Debug, Default, Clone, Copy, Deserialize)]
#[serde(default)]
struct Viewport {
    width: Option<f32>,
    height: Option<f32>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct FixtureConfig {
    extra_css: Vec<String>,
    viewport: Viewport,
}

#[derive(Debug, Deserialize)]
struct SuiteEntry {
    path: String,
    #[serde(default)]
    extra_css: Option<Vec<String>>,
    #[serde(default)]
    viewport: Option<Viewport>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct SuiteFile {
    defaults: FixtureConfig,
    fixtures: Vec<SuiteEntry>,
}

const DEFAULT_WIDTH: f32 = 600.0;
const DEFAULT_HEIGHT: f32 = 600.0;

/// Resolve a fixture entry against suite defaults. Suite-relative
/// paths are anchored at `suite_dir`. Viewport width/height inherit
/// from `defaults` and fall back to the built-in defaults.
fn resolve_entry(
    entry: &SuiteEntry,
    defaults: &FixtureConfig,
    suite_dir: &Path,
) -> (PathBuf, Vec<PathBuf>, f32, f32) {
    let html = suite_dir.join(&entry.path);
    let css_rel: &[String] = entry.extra_css.as_deref().unwrap_or(&defaults.extra_css);
    let css_abs: Vec<PathBuf> = css_rel.iter().map(|r| suite_dir.join(r)).collect();
    let vp = entry.viewport.unwrap_or(defaults.viewport);
    let width = vp
        .width
        .or(defaults.viewport.width)
        .unwrap_or(DEFAULT_WIDTH);
    let height = vp
        .height
        .or(defaults.viewport.height)
        .unwrap_or(DEFAULT_HEIGHT);
    (html, css_abs, width, height)
}

/// Populate `cache[abs]` if absent. Missing files warn; absent keys
/// are treated as a no-op at injection time.
fn ensure_css_cached(cache: &mut HashMap<PathBuf, String>, abs: &Path) {
    if cache.contains_key(abs) {
        return;
    }
    match std::fs::read_to_string(abs) {
        Ok(s) => {
            cache.insert(abs.to_path_buf(), s);
        }
        Err(e) => eprintln!("  warn: failed to read {}: {e}", abs.display()),
    }
}

fn render_to_png(
    html: &str,
    width: f32,
    height: f32,
    name: &str,
    out_dir: &Path,
    fonts: &FontRepository,
) {
    let picture =
        htmlcss::render(html, width, height, fonts, &htmlcss::NoImages).expect("render failed");
    let cull = picture.cull_rect();
    let w = cull.width().max(1.0) as i32;
    let h = cull.height().max(1.0) as i32;

    let mut surface = surfaces::raster_n32_premul((w, h)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);
    canvas.draw_picture(&picture, None, None);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let path = out_dir.join(format!("{name}.png"));
    std::fs::write(&path, data.as_bytes()).unwrap();
    eprintln!("  {name}: {w}x{h} → {}", path.display());
}

fn render_with_extras(
    html_path: &Path,
    extras_abs: &[PathBuf],
    width: f32,
    height: f32,
    out_dir: &Path,
    fonts: &FontRepository,
    css_cache: &mut HashMap<PathBuf, String>,
) {
    let html = std::fs::read_to_string(html_path)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", html_path.display()));
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

fn render_suite(suite_path: &Path, out_dir: &Path, fonts: &FontRepository) {
    let raw = std::fs::read_to_string(suite_path)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", suite_path.display()));
    let suite: SuiteFile = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("failed to parse {}: {e}", suite_path.display()));
    let suite_dir = suite_path.parent().unwrap_or(Path::new("."));

    eprintln!(
        "Rendering {} fixture(s) from suite {}",
        suite.fixtures.len(),
        suite_path.display()
    );
    let mut css_cache: HashMap<PathBuf, String> = HashMap::new();
    for entry in &suite.fixtures {
        let (html_path, extras_abs, width, height) =
            resolve_entry(entry, &suite.defaults, suite_dir);
        render_with_extras(
            &html_path,
            &extras_abs,
            width,
            height,
            out_dir,
            fonts,
            &mut css_cache,
        );
    }
}

fn render_directory(dir: &Path, out_dir: &Path, fonts: &FontRepository) {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .expect("failed to read directory")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.extension()
                .map(|ext| ext == "html" || ext == "htm")
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
            DEFAULT_WIDTH,
            DEFAULT_HEIGHT,
            out_dir,
            fonts,
            &mut css_cache,
        );
    }
}

/// Parse `argv` into (`suite_path`, positional args). If `--suite P`
/// is present, those two tokens are removed from the positional list.
fn parse_args(argv: &[String]) -> (Option<String>, Vec<String>) {
    let mut suite: Option<String> = None;
    let mut positional: Vec<String> = Vec::new();
    let mut i = 0;
    while i < argv.len() {
        let a = &argv[i];
        if a == "--suite" {
            let v = argv
                .get(i + 1)
                .unwrap_or_else(|| panic!("--suite requires a path argument"));
            suite = Some(v.clone());
            i += 2;
        } else if a.starts_with("--") {
            // Unknown flag; skip. Keeps future-flags additive without
            // contaminating the positional stream.
            i += 1;
        } else {
            positional.push(a.clone());
            i += 1;
        }
    }
    (suite, positional)
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let (suite, positional) = parse_args(&argv);

    // Output to system temp directory
    let out_dir = std::env::temp_dir().join("grida-htmlcss-goldens");
    std::fs::create_dir_all(&out_dir).expect("failed to create output directory");
    eprintln!("Output: {}", out_dir.display());

    let fonts = build_fonts();

    if let Some(suite_path) = suite {
        render_suite(Path::new(&suite_path), &out_dir, &fonts);
        eprintln!("Done. Files in: {}", out_dir.display());
        return;
    }

    if positional.is_empty() {
        let fixture_dir = PathBuf::from(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/test-html/L0"
        ));
        if fixture_dir.is_dir() {
            render_directory(&fixture_dir, &out_dir, &fonts);
        } else {
            eprintln!("No fixture directory found at {}", fixture_dir.display());
            eprintln!("Pass --suite <path> or HTML files as arguments.");
        }
    } else {
        let mut css_cache: HashMap<PathBuf, String> = HashMap::new();
        for arg in &positional {
            let path = PathBuf::from(arg);
            if path.is_dir() {
                render_directory(&path, &out_dir, &fonts);
            } else if path.is_file() {
                render_with_extras(
                    &path,
                    &[],
                    DEFAULT_WIDTH,
                    DEFAULT_HEIGHT,
                    &out_dir,
                    &fonts,
                    &mut css_cache,
                );
            } else {
                eprintln!("Skipping {}: not a file or directory", path.display());
            }
        }
    }

    eprintln!("Done. Files in: {}", out_dir.display());
}
