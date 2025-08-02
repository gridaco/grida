#[derive(Clone, Copy)]
pub struct RuntimeRendererConfig {
    /// When true, the renderer will cache image tiles to improve performance.
    pub cache_tile: bool,
}

impl Default for RuntimeRendererConfig {
    fn default() -> Self {
        Self { cache_tile: true }
    }
}
