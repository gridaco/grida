//! `SvgPainter` — uniform painter contract.
//!
//! Today every painter is a free function with the shape
//! `pub fn paint(canvas: &Canvas, ctx: &PaintCtx<'_>, node: NodeId)`.
//! Codifying that as a trait gives us a single place to enforce the
//! contract (signature, lifetime, no-Canvas-aware return) and a
//! single place a future polymorphic dispatch (e.g. `Box<dyn
//! SvgPainter>`) could plug in.
//!
//! Blink anchor: `core/paint/svg_*_painter.{h,cc}` files all expose a
//! `Paint(const PaintInfo&)` method on a `*Painter` class — we model
//! the same contract as a trait so the discipline is in the type
//! system, not in convention.
//!
//! Today this trait is intentionally not yet wired through every
//! painter. Add `impl SvgPainter for FooPainter` as part of the
//! follow-up that converts each painter to a struct. The trait is
//! defined now so the API decision is locked.

use csscascade::dom::NodeId;
use skia_safe::Canvas;

use super::scoped_svg_paint_state::PaintCtx;

/// Uniform painter contract. Mirrors Blink's `*Painter::Paint(PaintInfo)`.
pub trait SvgPainter {
    /// Paint `node`'s contribution into `canvas`.
    ///
    /// Implementations must be side-effect-free except for the canvas
    /// drawing operations they perform. They must not retain any
    /// borrow of `canvas` past return; the caller owns layer
    /// lifecycle.
    fn paint(canvas: &Canvas, ctx: &PaintCtx<'_>, node: NodeId);
}
