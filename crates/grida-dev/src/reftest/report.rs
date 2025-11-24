use anyhow::{Context, Result};
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Debug)]
pub struct TestResult {
    pub test_name: String,
    pub similarity_score: f64,
    pub diff_percentage: f64,
    pub output_png: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff_png: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct ReftestReport {
    pub total: usize,
    pub average_similarity: f64,
    pub min_similarity: f64,
    pub max_similarity: f64,
    pub tests: Vec<TestResult>,
    pub timestamp: String,
    pub suite_dir: String,
    pub output_dir: String,
}

impl ReftestReport {
    pub fn new(suite_dir: &Path, output_dir: &Path, tests: Vec<TestResult>) -> Self {
        let total = tests.len();
        
        let similarities: Vec<f64> = tests
            .iter()
            .filter_map(|t| if t.error.is_none() { Some(t.similarity_score) } else { None })
            .collect();

        let average_similarity = if similarities.is_empty() {
            0.0
        } else {
            similarities.iter().sum::<f64>() / similarities.len() as f64
        };

        let min_similarity = similarities
            .iter()
            .copied()
            .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or(0.0);

        let max_similarity = similarities
            .iter()
            .copied()
            .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or(0.0);

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();

        Self {
            total,
            average_similarity,
            min_similarity,
            max_similarity,
            tests,
            timestamp,
            suite_dir: suite_dir.to_string_lossy().to_string(),
            output_dir: output_dir.to_string_lossy().to_string(),
        }
    }
}

pub fn generate_json_report(report: &ReftestReport, output_path: &Path) -> Result<()> {
    // Ensure output directory exists
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create output directory {}", parent.display()))?;
    }

    let json = serde_json::to_string_pretty(report)
        .context("failed to serialize report to JSON")?;

    std::fs::write(output_path, json)
        .with_context(|| format!("failed to write report to {}", output_path.display()))?;

    Ok(())
}

