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
    pub pan: PanStats,
    pub zoom: ZoomStats,
}

#[derive(serde::Serialize)]
pub struct PanStats {
    pub avg_us: u64,
    pub fps: f64,
    pub p50_us: u64,
    pub p95_us: u64,
    pub p99_us: u64,
    pub draw_us: u64,
    pub mid_flush_us: u64,
    pub compositor_us: u64,
    pub flush_us: u64,
}

#[derive(serde::Serialize)]
pub struct ZoomStats {
    pub avg_us: u64,
    pub fps: f64,
    pub p50_us: u64,
    pub p95_us: u64,
    pub p99_us: u64,
}

#[derive(serde::Serialize)]
pub struct BenchError {
    pub file: String,
    pub error: String,
}
