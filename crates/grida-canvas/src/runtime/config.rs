#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PixelPreviewStrategy {
    /// Mathematically-correct mapping. May shimmer as zoom/pan changes sampling phase.
    Accurate,
    /// Designer-friendly mapping. Quantizes sizing/phase to avoid shimmer across pan+zoom.
    Stable,
}

#[derive(Clone, Copy)]
pub struct RuntimeRendererConfig {
    /// When true, the renderer will cache image tiles to improve performance.
    pub cache_tile: bool,
    /// Pixel preview scale factor:
    /// - 0: Disabled (normal rendering)
    /// - 1: 1x (more pixelated)
    /// - 2: 2x (less pixelated)
    pub pixel_preview_scale: u8,
    /// Pixel preview strategy (stability policy).
    pub pixel_preview_strategy: PixelPreviewStrategy,
    /// Render policy describing how content/effects/compositing should be rendered.
    pub render_policy: super::render_policy::RenderPolicy,
}

impl Default for RuntimeRendererConfig {
    fn default() -> Self {
        Self {
            cache_tile: true,
            pixel_preview_scale: 0,
            // Stable is the default policy when Pixel Preview is used.
            pixel_preview_strategy: PixelPreviewStrategy::Stable,
            render_policy: Default::default(),
        }
    }
}
