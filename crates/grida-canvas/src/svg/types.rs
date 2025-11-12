// Grida's own SVG Types (that with unique properties)

use crate::cg::prelude::*;

/// SVG stroke, stroke-* attributes definition as-is, following the SVG spec.
pub struct SVGStrokeAttributes {
    /// https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke
    pub paint: Paint,
    /// https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-width
    pub stroke_width: f32,
    /// https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-linecap
    pub stroke_linecap: StrokeCap,
    /// https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-linejoin
    pub stroke_linejoin: StrokeJoin,
    /// https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-miterlimit
    pub stroke_miterlimit: StrokeMiterLimit,
    /// https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dasharray
    pub stroke_dasharray: Option<StrokeDashArray>,
}

impl Default for SVGStrokeAttributes {
    fn default() -> Self {
        Self {
            paint: Paint::Solid(SolidPaint::TRANSPARENT),
            stroke_width: 0.0,
            stroke_linecap: StrokeCap::default(),
            stroke_linejoin: StrokeJoin::default(),
            stroke_miterlimit: StrokeMiterLimit::default(),
            stroke_dasharray: None,
        }
    }
}
