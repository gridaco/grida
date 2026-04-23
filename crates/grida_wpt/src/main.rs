//! `grida_wpt` CLI.
//!
//! Subcommands:
//!
//! * `render` — HTML+CSS fixtures → PNG via `cg::htmlcss` (the
//!   "actual" side of the reftest pair).
//!
//! Future: a `wpt` subcommand for the `wptrunner` product glue.

use clap::{Parser, Subcommand};
use grida_wpt::{fetch, render};
use std::path::{Path, PathBuf};

const DEFAULT_OUT_DIRNAME: &str = "grida-htmlcss-goldens";

fn default_out_dir() -> PathBuf {
    std::env::temp_dir().join(DEFAULT_OUT_DIRNAME)
}

#[derive(Debug, Parser)]
#[command(
    name = "grida_wpt",
    about = "Grida rendering-test harness (golden producer + WPT plugin).",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Debug, Subcommand)]
enum Cmd {
    /// Render HTML/CSS fixtures to PNG via the cg htmlcss renderer.
    Render(RenderArgs),
}

#[derive(Debug, clap::Args)]
struct RenderArgs {
    /// Suite JSON file. Fixtures and `extra_css` resolve relative to it.
    #[arg(long, value_name = "PATH", conflicts_with_all = ["fixture", "dir", "url"])]
    suite: Option<PathBuf>,

    /// Single HTML fixture to render (ad-hoc, no suite context).
    #[arg(long, value_name = "PATH", conflicts_with_all = ["dir", "url"])]
    fixture: Option<PathBuf>,

    /// Directory of HTML fixtures to render at default viewport.
    /// Accepts .html, .htm, .xht, and .xhtml files.
    #[arg(long, value_name = "DIR", conflicts_with = "url")]
    dir: Option<PathBuf>,

    /// URL to fetch and render (WPT serves tests over localhost). The
    /// HTML body is fetched via blocking HTTP and rendered at the
    /// default viewport. External assets referenced by the page
    /// (stylesheets, images) are NOT resolved — see adoption plan P4.
    #[arg(long, value_name = "URL")]
    url: Option<String>,

    /// Explicit output file path. Overrides `--out-dir` when set;
    /// intended for `wptrunner` which names PNGs deterministically.
    #[arg(long, value_name = "FILE", conflicts_with = "out_dir")]
    out: Option<PathBuf>,

    /// Output directory for rendered PNGs. Default:
    /// `${TMPDIR}/grida-htmlcss-goldens`.
    #[arg(long, value_name = "DIR")]
    out_dir: Option<PathBuf>,

    /// Viewport width override (px). Default from suite / built-in.
    #[arg(long, value_name = "PX")]
    width: Option<f32>,

    /// Viewport height override (px). Default from suite / built-in.
    #[arg(long, value_name = "PX")]
    height: Option<f32>,
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Cmd::Render(args) => cmd_render(args),
    }
}

fn cmd_render(args: RenderArgs) {
    let fonts = render::build_fonts();

    if let Some(url) = args.url.as_deref() {
        render_from_url(url, &args, &fonts);
        return;
    }

    let out_dir = args.out_dir.clone().unwrap_or_else(default_out_dir);
    std::fs::create_dir_all(&out_dir).expect("failed to create output directory");
    eprintln!("Output: {}", out_dir.display());

    if let Some(suite_path) = args.suite.as_deref() {
        render::render_suite(suite_path, &out_dir, &fonts);
    } else if let Some(fixture) = args.fixture.as_deref() {
        render_one(fixture, &out_dir, &fonts, &args);
    } else if let Some(dir) = args.dir.as_deref() {
        render::render_directory(dir, &out_dir, &fonts);
    } else {
        let fallback = PathBuf::from(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/test-html/L0"
        ));
        render::render_directory(&fallback, &out_dir, &fonts);
    }

    eprintln!("Done. Files in: {}", out_dir.display());
}

fn render_from_url(
    url: &str,
    args: &RenderArgs,
    fonts: &cg::runtime::font_repository::FontRepository,
) {
    eprintln!("Fetching {url}");
    let html = fetch::fetch_text(url);
    let width = args.width.unwrap_or(grida_wpt::suite::DEFAULT_WIDTH);
    let height = args.height.unwrap_or(grida_wpt::suite::DEFAULT_HEIGHT);

    let (out_dir, stem) = resolve_out(args, || fetch::stem_from_url(url));
    std::fs::create_dir_all(&out_dir).expect("failed to create output directory");
    render::render_to_png(&html, width, height, &stem, &out_dir, fonts);
}

fn render_one(
    html_path: &Path,
    out_dir: &Path,
    fonts: &cg::runtime::font_repository::FontRepository,
    args: &RenderArgs,
) {
    let mut cache = std::collections::HashMap::new();
    let width = args.width.unwrap_or(grida_wpt::suite::DEFAULT_WIDTH);
    let height = args.height.unwrap_or(grida_wpt::suite::DEFAULT_HEIGHT);
    render::render_with_extras(html_path, &[], width, height, out_dir, fonts, &mut cache);
}

/// Resolve output destination from `--out` (explicit file path) or
/// `--out-dir` + derived stem. Returns `(directory, stem)` so the
/// renderer can write `{directory}/{stem}.png`.
fn resolve_out(args: &RenderArgs, default_stem: impl FnOnce() -> String) -> (PathBuf, String) {
    if let Some(out) = args.out.as_deref() {
        let dir = out.parent().unwrap_or(Path::new(".")).to_path_buf();
        let stem = out
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(default_stem);
        return (dir, stem);
    }
    let dir = args.out_dir.clone().unwrap_or_else(default_out_dir);
    (dir, default_stem())
}
