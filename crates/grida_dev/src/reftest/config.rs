use anyhow::Result;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Default, Clone, Copy)]
pub(crate) struct DiffConfig {
    #[serde(default)]
    pub aa: Option<bool>,
    #[serde(default)]
    pub threshold: Option<f32>,
}

#[derive(Debug, Deserialize, Default, Clone)]
pub(crate) struct ScoringConfig {
    #[serde(default)]
    pub mask: Option<String>, // "none" | "alpha"
    /// Similarity floor at or above which a fixture is considered
    /// "passing". Defaults to `0.95` if unset. Used by aggregate
    /// reporting (consensus pass rate, etc.) — does not change
    /// per-test scoring.
    #[serde(default)]
    pub pass_floor: Option<f64>,
}

/// `[test.oracles]` — additional ground-truth sources beyond the
/// suite's `expected.png`. Both fields are paths relative to
/// `suite_dir`.
///
/// - `results_csv` — upstream per-renderer status matrix (used by
///   `resvg-test-suite`). Each row records whether
///   chrome/firefox/safari/resvg/etc. passed against that fixture's
///   `expected.png`. Drives the consensus / disputed / UB
///   classification.
/// - `chrome_baseline` — directory of pre-baked Chrome PNGs that
///   mirror the input layout (`<chrome_baseline>/<rel>.png`). When
///   present, the runner adds a second similarity score (vs. Chrome)
///   so disputed fixtures can pass against either oracle.
#[derive(Debug, Deserialize, Default, Clone)]
pub(crate) struct OraclesConfig {
    #[serde(default)]
    pub results_csv: Option<String>,
    #[serde(default)]
    pub chrome_baseline: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone)]
pub(crate) struct TestConfig {
    // Optional name under [test]
    #[serde(default)]
    pub name: Option<String>,

    #[serde(rename = "type")]
    #[serde(default)]
    #[allow(unused)]
    pub kind: Option<String>,
    #[serde(default)]
    pub inputs: Option<String>,
    #[serde(default)]
    pub expects: Option<String>,
    #[serde(default)]
    pub diff: Option<DiffConfig>,
    #[serde(default)]
    pub scoring: Option<ScoringConfig>,
    #[serde(default)]
    pub oracles: Option<OraclesConfig>,
    #[serde(default)]
    pub bg: Option<String>, // "black" | "white"
}

#[derive(Debug, Deserialize, Default)]
pub(crate) struct ReftestToml {
    // Legacy top-level name (still supported)
    #[serde(default)]
    pub name: Option<String>,

    // New preferred layout
    #[serde(default)]
    pub test: Option<TestConfig>,

    // Backward-compat: legacy top-level keys
    #[serde(rename = "type")]
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub inputs: Option<String>,
    #[serde(default)]
    pub expects: Option<String>,
    #[serde(default)]
    pub diff: Option<DiffConfig>,
    #[serde(default)]
    pub bg: Option<String>,
}

impl ReftestToml {
    pub(crate) fn load_from_dir(dir: &Path) -> Result<Option<Self>> {
        let path = dir.join("reftest.toml");
        if !path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(&path)?;
        let cfg: Self = toml::from_str(&content)?;
        Ok(Some(cfg))
    }

    fn pick_test(&self) -> TestConfig {
        if let Some(t) = &self.test {
            return t.clone();
        }
        // Build from legacy fields
        TestConfig {
            name: self.name.clone(),
            kind: self.kind.clone(),
            inputs: self.inputs.clone(),
            expects: self.expects.clone(),
            diff: self.diff,
            scoring: None, // Legacy configs don't have scoring
            oracles: None, // Legacy configs don't have oracles
            bg: self.bg.clone(),
        }
    }

    pub(crate) fn resolve_name(&self) -> Option<String> {
        let t = self.pick_test();
        t.name.or_else(|| self.name.clone())
    }

    pub(crate) fn input_pattern(&self) -> Option<&str> {
        if let Some(t) = &self.test {
            return t.inputs.as_deref();
        }
        self.inputs.as_deref()
    }

    pub(crate) fn resolve_inputs(&self, base: &Path) -> Option<PathBuf> {
        let t = self.pick_test();
        t.inputs.as_ref().map(|p| base.join(p))
    }
    pub(crate) fn resolve_expects(&self, base: &Path) -> Option<PathBuf> {
        let t = self.pick_test();
        t.expects.as_ref().map(|p| base.join(p))
    }
    pub(crate) fn resolve_bg(&self) -> Option<String> {
        self.pick_test().bg
    }
    pub(crate) fn resolve_diff(&self) -> Option<DiffConfig> {
        self.pick_test().diff
    }
    pub(crate) fn resolve_scoring(&self) -> Option<ScoringConfig> {
        self.pick_test().scoring
    }
    pub(crate) fn resolve_oracles(&self) -> Option<OraclesConfig> {
        self.pick_test().oracles
    }
    pub(crate) fn resolve_kind(&self) -> Option<String> {
        self.pick_test().kind
    }
}
