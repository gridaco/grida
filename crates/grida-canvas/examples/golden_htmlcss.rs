/// HTML+CSS renderer golden test tool.
///
/// Renders HTML files to PNG for visual inspection. Output goes to a
/// temporary directory (printed to stderr) so generated images don't
/// bloat the repository.
///
/// Usage:
///   cargo run -p cg --example golden_htmlcss -- [FILE_OR_DIR...]
///
/// If no arguments given, renders built-in test fixtures.
/// If a directory is given, renders all .html/.htm files in it.
use cg::htmlcss;
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use skia_safe::{surfaces, Color};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

fn fonts() -> FontRepository {
    let mut repo = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
    repo.enable_system_fallback();
    repo
}

fn render_to_png(html: &str, width: f32, name: &str, out_dir: &Path) {
    let fonts = fonts();
    let picture =
        htmlcss::render(html, width, 600.0, &fonts, &htmlcss::NoImages).expect("render failed");
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

fn render_html_file(path: &Path, out_dir: &Path) {
    let html = std::fs::read_to_string(path).expect("failed to read HTML file");
    let name = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    render_to_png(&html, 600.0, &name, out_dir);
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    // Output to system temp directory
    let out_dir = std::env::temp_dir().join("grida-htmlcss-goldens");
    std::fs::create_dir_all(&out_dir).expect("failed to create output directory");
    eprintln!("Output: {}", out_dir.display());

    if args.is_empty() {
        // Render built-in test fixtures from fixtures/test-html/L0/
        let fixture_dir = PathBuf::from(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/test-html/L0"
        ));
        if fixture_dir.is_dir() {
            render_directory(&fixture_dir, &out_dir);
        } else {
            eprintln!("No fixture directory found at {}", fixture_dir.display());
            eprintln!("Pass HTML files as arguments instead.");
        }
    } else {
        for arg in &args {
            let path = PathBuf::from(arg);
            if path.is_dir() {
                render_directory(&path, &out_dir);
            } else if path.is_file() {
                render_html_file(&path, &out_dir);
            } else {
                eprintln!("Skipping {}: not a file or directory", path.display());
            }
        }
    }

    eprintln!("Done. Files in: {}", out_dir.display());
}

fn render_directory(dir: &Path, out_dir: &Path) {
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
    for path in &entries {
        render_html_file(path, out_dir);
    }
}
