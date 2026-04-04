//! Promotion heuristics for the layer compositing cache.
//!
//! Only nodes with **expensive effects** (shadows, blurs, noise) are
//! promoted to GPU-backed cached textures.  Simple fill/stroke nodes
//! are cheaper to draw live — measured: 400 direct rect fills take
//! 3.2ms while 400 texture blits take 4.1ms + 0.4ms gpu_flush.
//!
//! Nodes that depend on backdrop content (backdrop blur, liquid glass)
//! cannot be captured in isolation and are excluded.

use crate::painter::layer::PainterPictureLayer;
use math2::rect::Rectangle;

/// Why a node was or was not promoted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromotionStatus {
    /// Promoted: content is cached as GPU SkImage.
    Promoted,
    /// Not promoted: node has no expensive effects — live draw is faster.
    NoExpensiveEffects,
    /// Not promoted: node is too small on screen to justify a texture.
    TooSmall,
    /// Not promoted: node has context-dependent effects (backdrop blur).
    ContextDependent,
    /// Not promoted: node is actively being edited.
    ActivelyEditing,
    /// Not promoted: memory budget exceeded.
    MemoryBudgetExceeded,
}

impl PromotionStatus {
    pub fn is_promoted(self) -> bool {
        matches!(self, Self::Promoted)
    }
}

/// Minimum screen-space area (px²) for promotion.
/// 4×4 = 16.  Even small nodes with expensive effects (shadows, blur)
/// benefit hugely from caching — a single shadow can cost 100µs+ to
/// repaint.  The per-node cache overhead (~1KB for a tiny texture) is
/// negligible compared to the effect cost.
const MIN_SCREEN_AREA: f32 = 4.0 * 4.0;

/// Decides whether a node should be promoted to a cached GPU image.
///
/// Only nodes with expensive effects (shadows, blurs, noise) are
/// promoted.  Measured on M2 Pro with 400 visible simple rects:
///   - live draw: 3.2ms (400 rect fills)
///   - cached blit: 4.1ms + 0.4ms gpu_flush (400 texture blits)
/// So for simple geometry, live draw wins.  Effects change the
/// equation because a single shadow node can cost 100µs+ to paint.
pub fn should_promote(
    layer: &PainterPictureLayer,
    _render_bounds: &Rectangle,
    screen_area: f32,
    is_editing: bool,
    memory_available: bool,
) -> PromotionStatus {
    if is_editing {
        return PromotionStatus::ActivelyEditing;
    }

    if screen_area < MIN_SCREEN_AREA {
        return PromotionStatus::TooSmall;
    }

    // Context-dependent effects can't be captured in isolation.
    if has_context_dependent_effects(layer) {
        return PromotionStatus::ContextDependent;
    }

    // Only promote nodes where rasterization cost >> blit cost.
    if !has_expensive_effects(layer) {
        return PromotionStatus::NoExpensiveEffects;
    }

    if !memory_available {
        return PromotionStatus::MemoryBudgetExceeded;
    }

    PromotionStatus::Promoted
}

/// Returns true if the node has any effects that make it a candidate for
/// compositor promotion (shadows, layer blur, noise).
///
/// This is a cheap check on struct fields (no HashMap lookups). Use it as
/// an early filter before the full `should_promote` evaluation to skip
/// nodes that will never be promoted.
pub fn has_promotable_effects(layer: &PainterPictureLayer) -> bool {
    has_expensive_effects(layer)
}

/// Returns true if the node has effects that are expensive to repaint
/// (shadows, layer blur, noise).
fn has_expensive_effects(layer: &PainterPictureLayer) -> bool {
    let effects = match layer {
        PainterPictureLayer::Shape(shape) => &shape.effects,
        PainterPictureLayer::Text(text) => &text.effects,
        PainterPictureLayer::Vector(vec) => &vec.effects,
        PainterPictureLayer::Markdown(md) => &md.effects,
        PainterPictureLayer::HtmlEmbed(h) => &h.effects,
    };
    effects.has_expensive_effects()
}

/// Returns true if the layer has effects that depend on content behind it
/// (backdrop blur, liquid glass) which can't be correctly captured in
/// isolation.
fn has_context_dependent_effects(layer: &PainterPictureLayer) -> bool {
    let effects = match layer {
        PainterPictureLayer::Shape(shape) => &shape.effects,
        PainterPictureLayer::Text(text) => &text.effects,
        PainterPictureLayer::Vector(vec) => &vec.effects,
        PainterPictureLayer::Markdown(md) => &md.effects,
        PainterPictureLayer::HtmlEmbed(h) => &h.effects,
    };
    effects.backdrop_blur.as_ref().is_some_and(|b| b.active)
        || effects.glass.as_ref().is_some_and(|g| g.active)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_flags() {
        assert!(PromotionStatus::Promoted.is_promoted());
        assert!(!PromotionStatus::NoExpensiveEffects.is_promoted());
        assert!(!PromotionStatus::TooSmall.is_promoted());
        assert!(!PromotionStatus::ContextDependent.is_promoted());
        assert!(!PromotionStatus::ActivelyEditing.is_promoted());
        assert!(!PromotionStatus::MemoryBudgetExceeded.is_promoted());
    }
}
