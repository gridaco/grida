#[derive(serde::Serialize)]
pub struct BenchReportOutput {
    pub meta: BenchReportMeta,
    pub results: Vec<SceneBenchResult>,
    pub errors: Vec<BenchError>,
}

#[derive(serde::Serialize)]
pub struct BenchReportMeta {
    pub frames: u32,
    pub viewport: [i32; 2],
    pub files_count: usize,
    pub scenes_count: usize,
}

#[derive(serde::Serialize)]
pub struct SceneBenchResult {
    pub file: String,
    pub scene: String,
    pub scene_index: usize,
    pub nodes: usize,
    pub effects_nodes: usize,
    /// Fit-zoom level used for this scene.
    pub fit_zoom: f32,
    /// Legacy single pan/zoom (kept for back-compat with existing tooling).
    pub pan: PassStats,
    pub zoom: PassStats,
    /// Expanded scenario matrix.
    pub scenarios: Vec<ScenarioResult>,
}

/// A named benchmark scenario result.
#[derive(serde::Serialize)]
pub struct ScenarioResult {
    /// Human-readable name, e.g. "pan_slow_fit", "zoom_fast".
    pub name: String,
    /// What kind of camera operation.
    pub kind: String,
    /// Parameters used.
    pub params: ScenarioParams,
    /// Timing results.
    pub stats: PassStats,
}

#[derive(serde::Serialize)]
pub struct ScenarioParams {
    /// For pan: world-units per frame. For zoom: zoom step per frame.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f32>,
    /// Zoom level at which pan was performed, or zoom range for zoom scenarios.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom: Option<f32>,
    /// Min zoom for zoom scenarios.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom_min: Option<f32>,
    /// Max zoom for zoom scenarios.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom_max: Option<f32>,
}

/// Unified pass stats with per-stage breakdown (used for both pan and zoom).
#[derive(serde::Serialize, Clone)]
pub struct PassStats {
    pub avg_us: u64,
    pub fps: f64,
    pub min_us: u64,
    pub p50_us: u64,
    pub p95_us: u64,
    pub p99_us: u64,
    /// Worst single frame — the visible jank spike.
    pub max_us: u64,
    /// queue() cost: R-tree culling + frame plan building.
    pub queue_us: u64,
    /// Painter / draw commands.
    pub draw_us: u64,
    /// Mid-frame GPU flush (isolates draw GPU work).
    pub mid_flush_us: u64,
    /// Compositor cache update.
    pub compositor_us: u64,
    /// Final GPU flush.
    pub flush_us: u64,
    /// Cost of the settle (stable) frame after the pass ends.
    pub settle_us: u64,
}

#[derive(serde::Serialize)]
pub struct BenchError {
    pub file: String,
    pub error: String,
}
