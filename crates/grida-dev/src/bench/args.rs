use clap::Args;

#[derive(Args, Debug)]
pub struct BenchArgs {
    /// Path to a `.grida` file (optional; uses synthetic grid if omitted).
    pub path: Option<String>,
    /// Grid dimension when no file is given (renders N x N rectangles).
    #[arg(long = "size", default_value_t = 100)]
    pub size: u32,
    /// Scene index to benchmark (0-based). Use --list-scenes to see available.
    #[arg(long = "scene", default_value_t = 0)]
    pub scene_index: usize,
    /// List available scene names and exit.
    #[arg(long = "list-scenes", default_value_t = false)]
    pub list_scenes: bool,
    /// Number of pan frames to measure.
    #[arg(long = "frames", default_value_t = 200)]
    pub frames: u32,
    /// Viewport width.
    #[arg(long = "width", default_value_t = 1000)]
    pub width: i32,
    /// Viewport height.
    #[arg(long = "height", default_value_t = 1000)]
    pub height: i32,
    /// Run the resize benchmark (alternates between two viewport sizes).
    #[arg(long = "resize", default_value_t = false)]
    pub resize: bool,
    /// Draw SurfaceUI overlay (frame titles, badges) on each frame.
    /// Measures the combined cost of content rendering + overlay drawing.
    #[arg(long = "overlay", default_value_t = false)]
    pub overlay: bool,
}

#[derive(Args, Debug)]
pub struct BenchReportArgs {
    /// Path to a `.grida` file or a directory (recursively finds `*.grida` files).
    pub path: String,
    /// Number of frames per benchmark pass (pan and zoom each).
    #[arg(long = "frames", default_value_t = 100)]
    pub frames: u32,
    /// Viewport width.
    #[arg(long = "width", default_value_t = 1000)]
    pub width: i32,
    /// Viewport height.
    #[arg(long = "height", default_value_t = 1000)]
    pub height: i32,
    /// Output file path for the JSON report (stdout if omitted).
    #[arg(long = "output")]
    pub output: Option<String>,
    /// Draw SurfaceUI overlay (frame titles, badges) on each frame.
    #[arg(long = "overlay", default_value_t = false)]
    pub overlay: bool,
}
