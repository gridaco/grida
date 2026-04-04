//! Render cost prediction — read-only metric for frame budget estimation.
//!
//! Estimates the GPU cost of rendering a frame based on the visible node set
//! and their effects. All constants are fixed-overhead costs measured on
//! Apple M2 Pro (Metal 4.1).
//!
//! This module is **debug/instrumentation only**. It does not influence
//! rendering decisions. The predicted cost is reported in `FramePlan` and
//! the devtools overlay for correlation analysis against actual frame times.
//!
//! ## Reference
//!
//! - [`docs/wg/feat-2d/render-cost-prediction.md`] — cost model derivation,
//!   benchmark results, Skia blur algorithm analysis, blend mode tiers,
//!   and calibration methodology.
//! - [`crates/grida-canvas/examples/skia_bench/skia_bench_cost_model.rs`] —
//!   per-effect validation benchmark (fixed cost extraction, linearity).
//! - [`crates/grida-canvas/examples/skia_bench/skia_bench_cache_blit.rs`] —
//!   cache hit/miss ratio measurement.
//! - [`crates/grida-canvas/examples/skia_bench/skia_bench_scene_scale.rs`] —
//!   full Renderer pipeline at 1K–136K nodes.

use crate::cg::fe::{FeBlur, FilterShadowEffect};
use crate::cg::prelude::LayerBlendMode;
use crate::painter::layer::PainterPictureLayer;

// ── Measured fixed-overhead constants (µs) ──────────────────────────
//
// Per-operation FBO/pipeline switch costs, NOT per-pixel.
// Source: skia_bench_cost_model (single rect, median of 50 runs).

/// Baseline draw call + flush overhead (no save_layer).
const COST_BASELINE_US: f64 = 12.0;

/// Gaussian blur: FBO + shader dispatch. For σ > 4.0, each additional
/// downsample level adds ~COST_BLUR_LEVEL_US.
const COST_BLUR_BASE_US: f64 = 73.0;
const COST_BLUR_LEVEL_US: f64 = 35.0;

/// Drop shadow: FBO + shadow filter dispatch.
const COST_SHADOW_US: f64 = 97.0;

/// Inner shadow: FBO + clip + shadow filter dispatch.
const COST_INNER_SHADOW_US: f64 = 72.0;

/// Non-PassThrough blend mode: FBO + blend resolve.
const COST_BLEND_MODE_US: f64 = 81.0;

/// Backdrop blur: FBO + dst snapshot + blur.
const COST_BACKDROP_BLUR_US: f64 = 110.0;

/// Group opacity isolation (save_layer_alpha).
const COST_OPACITY_ISOLATION_US: f64 = 20.0;

/// Compositor cache hit: single texture blit (~5µs, size-independent).
const COST_CACHE_HIT_US: f64 = 5.0;

// ── Public API ──────────────────────────────────────────────────────

/// Estimate the blur fixed cost based on sigma.
///
/// Skia uses direct convolution for σ ≤ 4.0 and recursive downsampling
/// for larger values. Each downsample level adds a fixed FBO overhead.
/// See `skia/src/core/SkBlurEngine.h` for the `kMaxLinearSigma = 4.0`
/// constant that drives this.
pub fn blur_cost_us(sigma: f32) -> f64 {
    if sigma <= 0.03 {
        return 0.0;
    }
    if sigma <= 4.0 {
        return COST_BLUR_BASE_US;
    }
    let levels = (sigma / 4.0).log2().ceil() as u32;
    COST_BLUR_BASE_US + levels as f64 * COST_BLUR_LEVEL_US
}

/// Estimate the fixed-overhead cost (µs) for rendering a single node.
///
/// `is_cache_hit`: true if the node will be drawn from the compositor
/// layer cache (texture blit) rather than live-rasterized.
pub fn estimate_node_cost(layer: &PainterPictureLayer, is_cache_hit: bool) -> f64 {
    if is_cache_hit {
        return COST_CACHE_HIT_US;
    }

    let mut cost = COST_BASELINE_US;

    let (effects, base) = match layer {
        PainterPictureLayer::Shape(s) => (&s.effects, &s.base),
        PainterPictureLayer::Text(t) => (&t.effects, &t.base),
        PainterPictureLayer::Vector(v) => (&v.effects, &v.base),
        PainterPictureLayer::Markdown(m) => (&m.effects, &m.base),
        PainterPictureLayer::HtmlEmbed(h) => (&h.effects, &h.base),
    };

    // Blur
    if let Some(blur) = &effects.blur {
        if blur.active {
            let sigma = match &blur.blur {
                FeBlur::Gaussian(g) => g.radius,
                FeBlur::Progressive(p) => p.radius.max(p.radius2),
            };
            cost += blur_cost_us(sigma);
        }
    }

    // Backdrop blur
    if let Some(backdrop) = &effects.backdrop_blur {
        if backdrop.active {
            let sigma = match &backdrop.blur {
                FeBlur::Gaussian(g) => g.radius,
                FeBlur::Progressive(p) => p.radius.max(p.radius2),
            };
            cost += COST_BACKDROP_BLUR_US.max(blur_cost_us(sigma));
        }
    }

    // Shadows
    for shadow in &effects.shadows {
        match shadow {
            FilterShadowEffect::DropShadow(s) => {
                if s.active {
                    cost += COST_SHADOW_US.max(blur_cost_us(s.blur));
                }
            }
            FilterShadowEffect::InnerShadow(s) => {
                if s.active {
                    cost += COST_INNER_SHADOW_US.max(blur_cost_us(s.blur));
                }
            }
        }
    }

    // Glass (treated as backdrop blur)
    if let Some(glass) = &effects.glass {
        if glass.active {
            cost += COST_BACKDROP_BLUR_US;
        }
    }

    // Blend mode isolation (non-PassThrough requires save_layer)
    if !matches!(base.blend_mode, LayerBlendMode::PassThrough) {
        cost += COST_BLEND_MODE_US;
    }

    // Group opacity isolation
    // Note: leaf nodes fold opacity into paint alpha; only groups need
    // save_layer. We can't distinguish group vs leaf from
    // PainterPictureLayer alone, so we conservatively add the cost.
    if base.opacity < 1.0 {
        cost += COST_OPACITY_ISOLATION_US;
    }

    cost
}
