use anyhow::Result;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Default, Clone, Copy)]
pub struct DiffConfig {
    #[serde(default)]
    pub aa: Option<bool>,
    #[serde(default)]
    pub threshold: Option<f32>,
}

#[derive(Debug, Deserialize, Default, Clone)]
pub struct TestConfig {
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
    pub bg: Option<String>, // "black" | "white"
}

#[derive(Debug, Deserialize, Default)]
pub struct ReftestToml {
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
    pub fn load_from_dir(dir: &Path) -> Result<Option<Self>> {
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
            bg: self.bg.clone(),
        }
    }

    pub fn resolve_name(&self) -> Option<String> {
        let t = self.pick_test();
        t.name.or_else(|| self.name.clone())
    }

    pub fn input_pattern(&self) -> Option<&str> {
        if let Some(t) = &self.test {
            return t.inputs.as_deref();
        }
        self.inputs.as_deref()
    }

    pub fn resolve_inputs(&self, base: &Path) -> Option<PathBuf> {
        let t = self.pick_test();
        t.inputs.as_ref().map(|p| base.join(p))
    }
    pub fn resolve_expects(&self, base: &Path) -> Option<PathBuf> {
        let t = self.pick_test();
        t.expects.as_ref().map(|p| base.join(p))
    }
    pub fn resolve_bg(&self) -> Option<String> {
        self.pick_test().bg
    }
    pub fn resolve_diff(&self) -> Option<DiffConfig> {
        self.pick_test().diff
    }
}
