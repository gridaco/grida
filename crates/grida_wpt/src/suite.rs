//! Suite config parsing for HTML/CSS golden runs.
//!
//! The JSON schema is shared between this Rust crate and the
//! TypeScript refbrowser oracle (`.agents/skills/cg-reftest/scripts/
//! refbrowser_render.ts`). Unknown fields (`gate`, `wait_for`,
//! `full_page`, `name`, `description`) are consumed by other tools
//! and deliberately ignored here.
//!
//! ```json
//! {
//!   "defaults": {
//!     "viewport": { "width": 600, "height": 800 },
//!     "extra_css": ["../_reftest/hide-text.css"]
//!   },
//!   "fixtures": [
//!     { "path": "../L0/box-dimensions.html",
//!       "viewport": { "width": 600, "height": 522 } }
//!   ]
//! }
//! ```
//!
//! Per-fixture entries inherit and override `defaults`. All paths
//! (`fixtures[].path`, `extra_css[]`) resolve **relative to the suite
//! file**.

use serde::Deserialize;
use std::path::{Path, PathBuf};

pub const DEFAULT_WIDTH: f32 = 600.0;
pub const DEFAULT_HEIGHT: f32 = 600.0;

#[derive(Debug, Default, Clone, Copy, Deserialize)]
#[serde(default)]
pub struct Viewport {
    pub width: Option<f32>,
    pub height: Option<f32>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct FixtureDefaults {
    pub extra_css: Vec<String>,
    pub viewport: Viewport,
}

#[derive(Debug, Deserialize)]
pub struct SuiteEntry {
    pub path: String,
    #[serde(default)]
    pub extra_css: Option<Vec<String>>,
    #[serde(default)]
    pub viewport: Option<Viewport>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct SuiteFile {
    pub defaults: FixtureDefaults,
    pub fixtures: Vec<SuiteEntry>,
}

/// Resolved fixture after merging defaults and anchoring paths.
#[derive(Debug)]
pub struct ResolvedFixture {
    pub html: PathBuf,
    pub extra_css: Vec<PathBuf>,
    pub width: f32,
    pub height: f32,
}

/// Resolve a fixture entry against suite defaults. Suite-relative
/// paths are anchored at `suite_dir`. Viewport width/height inherit
/// from `defaults` and fall back to the built-in defaults.
pub fn resolve_entry(
    entry: &SuiteEntry,
    defaults: &FixtureDefaults,
    suite_dir: &Path,
) -> ResolvedFixture {
    let html = suite_dir.join(&entry.path);
    let css_rel: &[String] = entry.extra_css.as_deref().unwrap_or(&defaults.extra_css);
    let extra_css: Vec<PathBuf> = css_rel.iter().map(|r| suite_dir.join(r)).collect();
    let vp = entry.viewport.unwrap_or(defaults.viewport);
    let width = vp.width.unwrap_or(DEFAULT_WIDTH);
    let height = vp.height.unwrap_or(DEFAULT_HEIGHT);
    ResolvedFixture {
        html,
        extra_css,
        width,
        height,
    }
}

/// Read and parse a suite JSON file.
pub fn load(suite_path: &Path) -> Result<SuiteFile, String> {
    let raw = std::fs::read_to_string(suite_path)
        .map_err(|e| format!("failed to read {}: {e}", suite_path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("failed to parse {}: {e}", suite_path.display()))
}
