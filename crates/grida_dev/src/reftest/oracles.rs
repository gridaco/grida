//! Oracle index — maps each fixture to its upstream per-renderer
//! status row from `results.csv`.
//!
//! Why
//! ---
//! The single `expected.png` shipped by `resvg-test-suite` is the
//! suite author's read of the spec. That is one oracle. The suite
//! also ships `results.csv`, a 9-column matrix of how each canonical
//! renderer (chrome, firefox, safari, resvg, batik, inkscape,
//! librsvg, svgnet, qtsvg) scored against that same expected.png.
//! That second oracle tells us when `expected.png` is consensus-correct
//! vs. arguable.
//!
//! The reftest harness ingests this matrix at run time so each result
//! carries:
//!  - which renderers passed (informational),
//!  - whether the fixture is **UB** (chrome=UNKNOWN), should be
//!    excluded from headline parity,
//!  - whether the fixture is **disputed** (chrome diverges from
//!    expected.png), where a Chrome-baked PNG is the better oracle.
//!
//! Format
//! ------
//! ```csv
//! title,chrome,firefox,safari,resvg,batik,inkscape,librsvg,svgnet,qtsvg
//! filters/enable-background/accumulate-with-new.svg,2,2,2,2,1,2,1,2,2
//! ```
//! Cells are: `0=UNKNOWN`, `1=PASSED`, `2=FAILED`, `3=CRASHED`. Title
//! is the suite-relative path of the SVG (with `/` separators and
//! `.svg` extension).

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Renderer status as encoded in `results.csv`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RendererStatus {
    Unknown,
    Passed,
    Failed,
    Crashed,
}

impl RendererStatus {
    fn from_cell(s: &str) -> Result<Self> {
        match s.trim() {
            "0" => Ok(Self::Unknown),
            "1" => Ok(Self::Passed),
            "2" => Ok(Self::Failed),
            "3" => Ok(Self::Crashed),
            other => Err(anyhow!("unrecognized renderer status cell: {other:?}")),
        }
    }
}

/// One row from `results.csv`: the per-renderer status for one fixture.
///
/// Columns are kept in upstream order so they round-trip into JSON
/// without reordering. We only act on chrome/firefox/safari/resvg
/// directly; the rest are informational.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub(crate) struct OracleFlags {
    pub chrome: RendererStatus,
    pub firefox: RendererStatus,
    pub safari: RendererStatus,
    pub resvg: RendererStatus,
    pub batik: RendererStatus,
    pub inkscape: RendererStatus,
    pub librsvg: RendererStatus,
    pub svgnet: RendererStatus,
    pub qtsvg: RendererStatus,
}

/// How the upstream oracles classify this fixture, derived from the
/// canonical-renderer subset (chrome / firefox / safari / resvg).
///
/// - `Consensus` — chrome agrees with `expected.png` (chrome=PASSED).
///   `expected.png` is authoritative; Chrome PNG (if baked) is just a
///   cross-check.
/// - `Disputed`  — chrome disagrees with `expected.png`. A baked
///   Chrome PNG is the better oracle here; the harness scores against
///   *both* expected and chrome and accepts either match.
/// - `Ub`        — chrome=UNKNOWN. The whole row is typically all
///   zeros; the fixture has no oracle (UB / unspecified). Excluded
///   from headline parity.
/// - `Unknown`   — no CSV row was found for this fixture. Treated
///   identically to `Disputed` for scoring (no consensus claim) but
///   surfaced separately so missing data is visible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum OracleStatus {
    Consensus,
    Disputed,
    Ub,
    Unknown,
}

impl OracleFlags {
    /// Classify this fixture's oracle status from the chrome cell.
    /// Chrome is the dominant browser engine and the closest practical
    /// "what users see"; treating it as the consensus pivot gives the
    /// most useful parity number.
    pub(crate) fn classify(&self) -> OracleStatus {
        match self.chrome {
            RendererStatus::Unknown => OracleStatus::Ub,
            RendererStatus::Passed => OracleStatus::Consensus,
            RendererStatus::Failed | RendererStatus::Crashed => OracleStatus::Disputed,
        }
    }
}

/// Index of `results.csv` rows keyed by suite-relative SVG path
/// (e.g. `"filters/enable-background/new.svg"`).
pub(crate) struct OracleIndex {
    rows: HashMap<String, OracleFlags>,
    /// Optional directory holding pre-baked Chrome PNGs that mirror
    /// the input layout (`<chrome_baseline>/<rel>.png`).
    pub(crate) chrome_baseline_dir: Option<PathBuf>,
}

impl OracleIndex {
    pub(crate) fn empty() -> Self {
        Self {
            rows: HashMap::new(),
            chrome_baseline_dir: None,
        }
    }

    pub(crate) fn load(csv_path: &Path) -> Result<Self> {
        let body = fs::read_to_string(csv_path)
            .with_context(|| format!("failed to read oracle CSV {}", csv_path.display()))?;
        let mut rows = HashMap::new();
        for (lineno, line) in body.lines().enumerate() {
            if line.is_empty() {
                continue;
            }
            // Skip header.
            if lineno == 0 && line.starts_with("title,") {
                continue;
            }
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() < 10 {
                // Tolerate stray short rows rather than aborting the
                // whole reftest run; CSV authors occasionally append
                // experimental columns.
                continue;
            }
            let title = parts[0].trim().to_string();
            if title.is_empty() {
                continue;
            }
            let flags = OracleFlags {
                chrome: RendererStatus::from_cell(parts[1])
                    .with_context(|| format!("{}: line {}", csv_path.display(), lineno + 1))?,
                firefox: RendererStatus::from_cell(parts[2])
                    .with_context(|| format!("{}: line {}", csv_path.display(), lineno + 1))?,
                safari: RendererStatus::from_cell(parts[3])
                    .with_context(|| format!("{}: line {}", csv_path.display(), lineno + 1))?,
                resvg: RendererStatus::from_cell(parts[4])
                    .with_context(|| format!("{}: line {}", csv_path.display(), lineno + 1))?,
                batik: RendererStatus::from_cell(parts[5])
                    .with_context(|| format!("{}: line {}", csv_path.display(), lineno + 1))?,
                inkscape: RendererStatus::from_cell(parts[6])
                    .with_context(|| format!("{}: line {}", csv_path.display(), lineno + 1))?,
                librsvg: RendererStatus::from_cell(parts[7])
                    .with_context(|| format!("{}: line {}", csv_path.display(), lineno + 1))?,
                svgnet: RendererStatus::from_cell(parts[8])
                    .with_context(|| format!("{}: line {}", csv_path.display(), lineno + 1))?,
                qtsvg: RendererStatus::from_cell(parts[9])
                    .with_context(|| format!("{}: line {}", csv_path.display(), lineno + 1))?,
            };
            rows.insert(title, flags);
        }
        Ok(Self {
            rows,
            chrome_baseline_dir: None,
        })
    }

    /// Resolve the `[test.oracles]` section from the suite's
    /// `reftest.toml` and load both the CSV and the chrome baseline
    /// directory. Returns `Self::empty()` (not an error) when the
    /// config or files are absent — the runner is happy to operate
    /// without oracles. Stderr is used for non-fatal diagnostics
    /// (missing CSV, missing baseline dir).
    pub(crate) fn load_from_dir(suite_dir: &Path) -> Self {
        use crate::reftest::config::ReftestToml;
        let cfg = match ReftestToml::load_from_dir(suite_dir) {
            Ok(Some(c)) => c,
            _ => return Self::empty(),
        };
        let Some(oracles_cfg) = cfg.resolve_oracles() else {
            return Self::empty();
        };
        let mut idx = if let Some(rel) = oracles_cfg.results_csv.as_deref() {
            let p = suite_dir.join(rel);
            match Self::load(&p) {
                Ok(i) => i,
                Err(e) => {
                    eprintln!("warning: failed to load oracle CSV {}: {e:#}", p.display());
                    Self::empty()
                }
            }
        } else {
            Self::empty()
        };
        if let Some(rel) = oracles_cfg.chrome_baseline.as_deref() {
            let p = suite_dir.join(rel);
            if p.is_dir() {
                idx.chrome_baseline_dir = Some(p);
            } else {
                eprintln!(
                    "warning: chrome baseline directory {} does not exist; skipping",
                    p.display()
                );
            }
        }
        idx
    }

    /// Look up the row for a suite-relative path. The argument is the
    /// raw `<rel>` (forward slashes, with `.svg` suffix) — exactly as
    /// stored in `results.csv`.
    pub(crate) fn lookup(&self, rel_svg: &str) -> Option<OracleFlags> {
        self.rows.get(rel_svg).copied()
    }

    pub(crate) fn len(&self) -> usize {
        self.rows.len()
    }

    /// Resolve a baked Chrome PNG path for a given suite-relative
    /// SVG, if a baseline directory is configured and the file
    /// actually exists on disk. Returns `None` when no baseline is
    /// configured or the file is missing.
    pub(crate) fn chrome_png_for(&self, rel_svg: &str) -> Option<PathBuf> {
        let dir = self.chrome_baseline_dir.as_ref()?;
        // Replace `.svg` suffix with `.png`; mirror layout otherwise.
        let rel_png = rel_svg.strip_suffix(".svg").unwrap_or(rel_svg);
        let path = dir.join(format!("{rel_png}.png"));
        if path.exists() {
            Some(path)
        } else {
            None
        }
    }
}

/// Normalize a suite-relative SVG path into the form used as a key
/// in `results.csv`: forward slashes, with the original `.svg`
/// extension preserved. Accepts `&Path` so callers can pass the
/// `rel_svg_path` they already computed in the runner.
pub(crate) fn rel_key(rel: &Path) -> String {
    let mut s = String::new();
    for (i, comp) in rel.iter().enumerate() {
        if i > 0 {
            s.push('/');
        }
        s.push_str(&comp.to_string_lossy());
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_temp_csv(name: &str, body: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "grida-reftest-oracles-{}-{}.csv",
            std::process::id(),
            name
        ));
        fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn parses_simple_rows() {
        let p = write_temp_csv(
            "simple",
            "title,chrome,firefox,safari,resvg,batik,inkscape,librsvg,svgnet,qtsvg\n\
             filters/enable-background/accumulate-with-new.svg,2,2,2,2,1,2,1,2,2\n\
             structure/svg/explicit-svg-namespace.svg,1,1,1,1,1,1,1,1,1\n",
        );
        let idx = OracleIndex::load(&p).unwrap();
        let _ = fs::remove_file(&p);
        assert_eq!(idx.len(), 2);

        let row = idx
            .lookup("filters/enable-background/accumulate-with-new.svg")
            .unwrap();
        assert_eq!(row.chrome, RendererStatus::Failed);
        assert_eq!(row.batik, RendererStatus::Passed);
        assert_eq!(row.classify(), OracleStatus::Disputed);

        let row = idx
            .lookup("structure/svg/explicit-svg-namespace.svg")
            .unwrap();
        assert_eq!(row.chrome, RendererStatus::Passed);
        assert_eq!(row.classify(), OracleStatus::Consensus);
    }

    #[test]
    fn classifies_ub_when_chrome_unknown() {
        let p = write_temp_csv(
            "ub",
            "title,chrome,firefox,safari,resvg,batik,inkscape,librsvg,svgnet,qtsvg\n\
             structure/svg/invalid-id-attribute-1.svg,0,0,0,0,0,0,0,0,0\n",
        );
        let idx = OracleIndex::load(&p).unwrap();
        let _ = fs::remove_file(&p);
        let row = idx
            .lookup("structure/svg/invalid-id-attribute-1.svg")
            .unwrap();
        assert_eq!(row.classify(), OracleStatus::Ub);
    }

    #[test]
    fn rel_key_uses_forward_slashes() {
        let p = PathBuf::from("filters")
            .join("enable-background")
            .join("new.svg");
        assert_eq!(rel_key(&p), "filters/enable-background/new.svg");
    }
}
