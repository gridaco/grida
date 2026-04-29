use clap::{Args, Subcommand};
use std::path::PathBuf;

#[derive(Debug, Clone, Copy)]
pub(crate) enum BgColor {
    White,
    Black,
}

impl std::str::FromStr for BgColor {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "white" => Ok(BgColor::White),
            "black" => Ok(BgColor::Black),
            other => Err(format!("invalid bg color: {} (use white|black)", other)),
        }
    }
}

/// Choice of SVG renderer backend.
///
/// - `Iosvg` (default): current path — parse SVG via vendored usvg,
///   convert to the Grida scene graph through `grida::import::svg::pack`, render
///   via the canvas runtime. Lossy (editor-oriented tree surgery), but
///   GPU-native and consistent with the in-editor experience.
/// - `Htmlcss`: goes through `grida::htmlcss::svg::render_to_picture*`
///   (or its `_with_context` variant when host hooks are needed),
///   which records into a Skia `Picture` via `PictureRecorder` before
///   rasterizing. Exercises the exact code path that inline `<svg>`
///   inside HTML takes, end-to-end through the in-tree
///   `htmlcss::svg` renderer (no fallback to Skia's built-in
///   `svg::Dom`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SvgRenderer {
    Iosvg,
    Htmlcss,
}

impl std::str::FromStr for SvgRenderer {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "iosvg" | "grida" | "pack" => Ok(SvgRenderer::Iosvg),
            "htmlcss" => Ok(SvgRenderer::Htmlcss),
            other => Err(format!("invalid renderer: {} (use iosvg|htmlcss)", other)),
        }
    }
}

/// Top-level `reftest` command. Wraps a subcommand. The whole
/// pipeline lives behind `cargo run -p grida_dev -- reftest <verb>`
/// so there is exactly one entry point for humans, agents, and CI.
#[derive(Args, Debug)]
pub(crate) struct ReftestArgs {
    #[command(subcommand)]
    pub command: ReftestCmd,
}

#[derive(Subcommand, Debug)]
pub(crate) enum ReftestCmd {
    /// Run the reftest suite. Renders every fixture, scores against
    /// `expected.png` and (when baked) `chrome.png`, writes a
    /// `report.json` plus per-bucket result tiles.
    Run(RunArgs),
    /// Bake Chrome PNGs for every fixture into
    /// `<suite>/chrome-baseline/`. One-time, deterministic per
    /// Chrome version. Drives the disputed-bucket scoring.
    Bake(BakeArgs),
    /// Serve the dashboard against a result directory.
    View(ViewArgs),
    /// Print everything the system knows about one fixture: oracle
    /// flags, scores, all four image paths, suite-relative SVG path.
    /// Designed for agents to read at a glance.
    Inspect(InspectArgs),
    /// Print headline parity numbers from a `report.json`.
    /// `--json` makes the output machine-readable.
    Summary(SummaryArgs),
}

#[derive(Args, Debug)]
pub(crate) struct RunArgs {
    /// Path to the suite directory (must contain `reftest.toml` or
    /// the legacy `svg/` + `png/` layout).
    #[arg(long = "suite-dir")]
    pub suite_dir: PathBuf,

    /// Override the result directory. Defaults to
    /// `target/reftests/<suite-name>[.<renderer>]`.
    #[arg(long = "output-dir")]
    pub output_dir: Option<PathBuf>,

    /// Substring or `prefix*` filter against test names.
    #[arg(long = "filter")]
    pub filter: Option<String>,

    /// Diff threshold in YIQ space (0.0 = strict).
    #[arg(long = "threshold", default_value_t = 0.0)]
    pub threshold: f32,

    /// Treat anti-aliasing differences as non-diffs.
    #[arg(long = "aa", default_value_t = false)]
    pub detect_anti_aliasing: bool,

    /// Background to composite before diffing (white|black).
    #[arg(long = "bg", default_value = "black")]
    pub bg: BgColor,

    #[arg(long = "diff-tool", hide = true)]
    pub diff_tool: Option<String>,

    /// Overwrite an existing output directory (default: true).
    #[arg(long = "overwrite", action = clap::ArgAction::SetTrue)]
    #[arg(long = "no-overwrite", action = clap::ArgAction::SetFalse, overrides_with = "overwrite")]
    pub overwrite: Option<bool>,

    /// SVG renderer backend (`iosvg` | `htmlcss`).
    #[arg(long = "renderer", default_value = "iosvg")]
    pub renderer: SvgRenderer,
}

#[derive(Args, Debug)]
pub(crate) struct BakeArgs {
    /// Suite directory.
    #[arg(long = "suite-dir", default_value = "fixtures/local/resvg-test-suite")]
    pub suite_dir: PathBuf,

    /// Substring filter against suite-relative paths
    /// (e.g. `feBlend` or `masking/clipPath`).
    #[arg(long = "filter")]
    pub filter: Option<String>,

    /// Number of concurrent puppeteer pages.
    #[arg(long = "concurrency", default_value_t = 4)]
    pub concurrency: u32,

    /// Re-render even if a baked PNG already exists.
    #[arg(long = "force", default_value_t = false)]
    pub force: bool,

    /// Re-bake only fixtures listed in the previous run's
    /// `BAKE_ERRORS.log` (implies `--force` for those fixtures).
    #[arg(long = "retry-failed", default_value_t = false)]
    pub retry_failed: bool,
}

#[derive(Args, Debug)]
pub(crate) struct ViewArgs {
    /// Result directory containing `report.json` and bucket subdirs.
    pub result_dir: PathBuf,

    /// HTTP port to serve on.
    #[arg(long = "port", default_value_t = 8000)]
    pub port: u16,
}

#[derive(Args, Debug)]
pub(crate) struct InspectArgs {
    /// Fixture identifier — accepts either `cat_group_name` (test
    /// name form, as it appears in `report.json`) or
    /// `cat/group/name.svg` (suite-relative path form).
    pub fixture: String,

    /// Suite directory.
    #[arg(long = "suite-dir", default_value = "fixtures/local/resvg-test-suite")]
    pub suite_dir: PathBuf,

    /// Result directory to also pull scores from. Defaults to the
    /// canonical htmlcss result path.
    #[arg(
        long = "result-dir",
        default_value = "target/reftests/resvg-test-suite.htmlcss"
    )]
    pub result_dir: PathBuf,

    /// Emit JSON instead of human-readable text.
    #[arg(long = "json", default_value_t = false)]
    pub json: bool,
}

#[derive(Args, Debug)]
pub(crate) struct SummaryArgs {
    /// Path to `report.json`. Defaults to the canonical htmlcss
    /// result path.
    #[arg(
        long = "report",
        default_value = "target/reftests/resvg-test-suite.htmlcss/report.json"
    )]
    pub report: PathBuf,

    /// Emit JSON instead of human-readable text.
    #[arg(long = "json", default_value_t = false)]
    pub json: bool,
}
