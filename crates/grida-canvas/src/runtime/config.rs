#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PixelPreviewStrategy {
    /// Mathematically-correct mapping. May shimmer as zoom/pan changes sampling phase.
    Accurate,
    /// Designer-friendly mapping. Quantizes sizing/phase to avoid shimmer across pan+zoom.
    Stable,
}

#[derive(Clone, Copy)]
pub struct RuntimeRendererConfig {
    /// When true, the renderer uses per-node layer compositing cache.
    /// Each promoted node gets its own `SkImage` backing store.
    pub layer_compositing: bool,
    /// When true, compositor cached images are packed into texture atlas
    /// pages for batch-friendly GPU compositing. When false, each cached
    /// node uses an individual GPU texture (more texture switching, slower
    /// at scale, but simpler).
    ///
    /// Only effective when `layer_compositing` is also true.
    pub compositor_atlas: bool,
    /// Resolution scale for unstable (interaction) frames.
    ///
    /// During active pan/zoom, the scene is rendered at this fraction of
    /// the display resolution into an offscreen, then upscaled with
    /// bilinear filtering. Reduces all GPU work proportionally (geometry,
    /// effects, blits).
    ///
    /// - `1.0`: full resolution (no downscaling, default off)
    /// - `0.5`: quarter the pixels (4× less GPU work)
    /// - `0.25`: 1/16th the pixels (16× less GPU work, very blurry)
    /// - `0.0`: disabled (same as 1.0)
    ///
    /// Only applies to unstable frames. Stable frames always render at
    /// full resolution.
    pub interaction_render_scale: f32,
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
            layer_compositing: true,
            compositor_atlas: true,
            interaction_render_scale: 0.5,
            pixel_preview_scale: 0,
            pixel_preview_strategy: PixelPreviewStrategy::Stable,
            render_policy: Default::default(),
        }
    }
}
