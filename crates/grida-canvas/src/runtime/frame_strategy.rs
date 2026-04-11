// ---------------------------------------------------------------------------
// Frame Render Strategy
// ---------------------------------------------------------------------------
//
// Centralizes all per-frame rendering policy decisions into a single struct
// computed once per frame. Instead of scattering `if zoom > X && backend.is_gpu()
// && config.Y` checks throughout the rendering pipeline, the strategy is built
// from the current renderer state and then consulted at each decision point.
//
// To change rendering policy (e.g. add a new zoom threshold, disable caching
// under certain conditions, etc.), modify `FrameRenderStrategy::compute()` —
// the call sites in scene.rs only read the boolean fields.
// ---------------------------------------------------------------------------

use crate::runtime::camera::CameraChangeKind;
use crate::runtime::config::RuntimeRendererConfig;

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/// Zoom threshold above which the pan/zoom image caches are bypassed and
/// every frame is a full-quality draw ("eager render").
///
/// At zoom >= 0.5 (50%), the number of visible nodes is typically small
/// enough that a full draw completes well within the frame budget. Disabling
/// the viewport snapshot caches at this level avoids the "blurry during
/// gesture, sharp on settle" quality dip — the user sees pixel-perfect
/// content at all times without waiting for a settle frame.
///
/// Below 0.5, the caches remain active because the full scene may be visible
/// and a full draw would exceed the frame budget.
pub const EAGER_RENDER_ZOOM_THRESHOLD: f32 = 0.5;

// ---------------------------------------------------------------------------
// Strategy struct
// ---------------------------------------------------------------------------

/// Pre-computed rendering decisions for a single frame.
///
/// Built once at the start of the frame pipeline from the current renderer
/// state (zoom level, backend type, camera change, stability, config flags).
/// All rendering code paths consult this struct instead of re-deriving the
/// same conditions independently.
///
/// # Adding a new policy gate
///
/// 1. Add a field to this struct.
/// 2. Compute it in [`Self::compute()`] from the relevant inputs.
/// 3. Use the field at the call site(s) in `scene.rs`.
///
/// This keeps policy logic in one place and call sites trivially simple.
#[derive(Debug, Clone, Copy)]
pub struct FrameRenderStrategy {
    /// Whether the pan/zoom image cache fast paths (offset blit, scaled blit)
    /// may be used to satisfy this frame without a full draw.
    ///
    /// False when:
    /// - Not on a GPU backend (caches are GPU textures)
    /// - Zoom >= eager-render threshold (full draws are cheap enough)
    /// - Stable frame (must produce full-quality output, not a cached blit)
    pub use_image_caches: bool,

    /// Whether to capture GPU surface snapshots into the pan/zoom image
    /// caches after a full draw completes.
    ///
    /// Differs from `use_image_caches` on **stable frames**: we never *use*
    /// a cached blit on a stable frame (quality requirement), but we still
    /// *capture* so the next unstable frame has a fresh cache to blit from.
    ///
    /// False at high zoom (eager render) — caches won't be consulted on
    /// future frames either, so capturing wastes GPU readback time.
    pub capture_image_caches: bool,

    /// Whether compositor layer caching (per-node GPU textures for effect
    /// nodes) should run after the draw phase.
    ///
    /// Requires: GPU backend, `layer_compositing` config enabled,
    /// render policy allows layer compositing.
    pub use_compositor: bool,

    /// Whether the frame plan can be deferred (lazy R-tree query).
    ///
    /// Deferral only makes sense when a cache fast path is likely to
    /// satisfy the frame, making the R-tree query unnecessary. When image
    /// caches are disabled (eager render, stable frame, raster backend)
    /// or no cache is populated, the plan must be built eagerly.
    pub can_defer_plan: bool,

    /// Whether eager-render mode is active (zoom >= threshold).
    ///
    /// When true, the renderer prioritizes pixel-perfect output over
    /// interaction performance tricks. Downstream code uses this to
    /// disable quality-reducing shortcuts (effect LOD, interaction
    /// downscale) that would otherwise fire on unstable frames.
    pub eager_render: bool,
}

impl FrameRenderStrategy {
    /// Compute the render strategy for the current frame.
    ///
    /// This is the **single source of truth** for all per-frame policy
    /// decisions. Call it once at the start of the frame and pass the
    /// result through the pipeline.
    pub fn compute(
        zoom: f32,
        is_gpu: bool,
        stable: bool,
        camera_change: CameraChangeKind,
        config: &RuntimeRendererConfig,
        has_pan_cache: bool,
        has_zoom_cache: bool,
    ) -> Self {
        // --- Eager render gate ---
        // At high zoom, bypass image caches for always-sharp output.
        let eager_render = zoom >= EAGER_RENDER_ZOOM_THRESHOLD;

        // Image caches are GPU textures — useless on raster backends.
        // At high zoom (eager render), full draws are cheap and caches
        // add quality loss, so they're disabled entirely.
        let caches_possible = is_gpu && !eager_render;

        // --- Image cache usage ---
        // Never blit from a cached snapshot on stable frames — the whole
        // point of a stable frame is to produce full-quality output at
        // the correct zoom density.
        let use_image_caches = caches_possible && !stable;

        // --- Image cache capture ---
        // Capture even on stable frames so the NEXT unstable frame has a
        // fresh cache. Only skip when caches are fundamentally disabled
        // (raster backend or eager-render mode).
        let capture_image_caches = caches_possible;

        // --- Compositor ---
        let use_compositor =
            is_gpu && config.layer_compositing && config.render_policy.allows_layer_compositing();

        // --- Plan deferral ---
        // Only defer when a cache is likely to hit (saves ~400-500µs
        // R-tree query on 136K+ node scenes). Requires use_image_caches
        // (which already encodes !stable and !eager_render).
        let can_defer_plan = use_image_caches
            && (
                // Pan cache will likely hit
                (camera_change == CameraChangeKind::PanOnly && has_pan_cache)
                // Zoom cache will likely hit
                || (camera_change.zoom_changed() && has_zoom_cache)
                // No-change: prefer zoom cache, fall back to pan cache
                || (camera_change == CameraChangeKind::None
                    && (has_zoom_cache || has_pan_cache))
            );

        Self {
            use_image_caches,
            capture_image_caches,
            use_compositor,
            can_defer_plan,
            eager_render,
        }
    }
}
