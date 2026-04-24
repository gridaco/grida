use clap::Args;
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
///   convert to the Grida scene graph through `cg::svg::pack`, render
///   via the canvas runtime. Lossy (editor-oriented tree surgery), but
///   GPU-native and consistent with the in-editor experience.
/// - `Htmlcss`: new path — hand raw SVG bytes to
///   `cg::htmlcss::render_svg`, which delegates to Skia's built-in
///   `svg::Dom`. Targets as-is rendering fidelity (Chromium-style),
///   used for WPT-style reftests.
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
            "htmlcss" | "skia" | "skia-svg" | "skiasvg" => Ok(SvgRenderer::Htmlcss),
            other => Err(format!("invalid renderer: {} (use iosvg|htmlcss)", other)),
        }
    }
}

#[derive(Args, Debug)]
pub(crate) struct ReftestArgs {
    /// Path to W3C_SVG_11_TestSuite directory
    #[arg(long = "suite-dir")]
    pub suite_dir: PathBuf,

    /// Directory for a.png (actual), b.png (expected), d.png (diff), and report.json
    #[arg(long = "output-dir")]
    pub output_dir: Option<PathBuf>,

    /// Filter test files by pattern (e.g., "shapes-*")
    #[arg(long = "filter")]
    pub filter: Option<String>,

    /// Diff threshold in YIQ space (0.0 = strict, count any difference)
    #[arg(long = "threshold", default_value_t = 0.0)]
    pub threshold: f32,

    /// Enable anti-aliasing detection (default: off). When enabled, AA pixels are not counted as diffs.
    #[arg(long = "aa", default_value_t = false)]
    pub detect_anti_aliasing: bool,

    /// Background to composite before diffing (white|black)
    #[arg(long = "bg", default_value = "black")]
    pub bg: BgColor,

    /// Path to external diff tool for generating diff.png (deprecated: using dify crate now)
    #[arg(long = "diff-tool", hide = true)]
    pub diff_tool: Option<String>,

    /// Overwrite existing output directory (default: true, use --no-overwrite to exit if directory exists)
    #[arg(long = "overwrite", action = clap::ArgAction::SetTrue)]
    #[arg(long = "no-overwrite", action = clap::ArgAction::SetFalse, overrides_with = "overwrite")]
    pub overwrite: Option<bool>,

    /// SVG renderer backend: `iosvg` (default — cg scene graph) or
    /// `htmlcss` (Skia's built-in svg::Dom, used for WPT-style reftests).
    #[arg(long = "renderer", default_value = "iosvg")]
    pub renderer: SvgRenderer,
}
