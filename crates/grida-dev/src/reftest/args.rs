use clap::Args;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy)]
pub enum BgColor {
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

#[derive(Args, Debug)]
pub struct ReftestArgs {
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
}
