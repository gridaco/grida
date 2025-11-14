// Grida's own SVG Types (that with unique properties)

use crate::cg::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SVGPaint {
    Solid(SVGSolidPaint),
    LinearGradient(SVGLinearGradientPaint),
    RadialGradient(SVGRadialGradientPaint),
}

impl SVGPaint {
    pub const TRANSPARENT: Self = Self::Solid(SVGSolidPaint {
        color: CGColor::TRANSPARENT,
    });
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SVGSolidPaint {
    pub color: CGColor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SVGLinearGradientPaint {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SVGRadialGradientPaint {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SVGFillAttributes {
    /// [`fill`] property
    ///
    /// [`fill`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/fill
    pub paint: SVGPaint,
    /// [`fill-opacity`] property
    ///
    /// [`fill-opacity`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/fill-opacity
    pub fill_opacity: f32,
    // [`fill-rule`] property
    ///
    /// [`fill-rule`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/fill-rule
    pub fill_rule: FillRule,
}

/// SVG stroke, stroke-* attributes definition as-is, following the SVG spec.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SVGStrokeAttributes {
    /// [`stroke`] property
    ///
    /// [`stroke`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke
    pub paint: SVGPaint,
    /// [`stroke-width`] property
    ///
    /// [`stroke-width`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-width
    pub stroke_width: f32,
    /// [`stroke-linecap`] property
    ///
    /// [`stroke-linecap`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-linecap
    pub stroke_linecap: StrokeCap,
    /// [`stroke-linejoin`] property
    ///
    /// [`stroke-linejoin`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-linejoin
    pub stroke_linejoin: StrokeJoin,
    /// [`stroke-miterlimit`] property
    ///
    /// [`stroke-miterlimit`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-miterlimit
    pub stroke_miterlimit: StrokeMiterLimit,
    /// [`stroke-dasharray`] property
    ///
    /// [`stroke-dasharray`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dasharray
    pub stroke_dasharray: Option<StrokeDashArray>,
    /// [`stroke-opacity`] property
    ///
    /// [`stroke-opacity`]: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-opacity
    pub stroke_opacity: f32,
}

impl Default for SVGStrokeAttributes {
    fn default() -> Self {
        Self {
            paint: SVGPaint::TRANSPARENT,
            stroke_width: 1.0,
            stroke_linecap: StrokeCap::default(),
            stroke_linejoin: StrokeJoin::default(),
            stroke_miterlimit: StrokeMiterLimit::default(),
            stroke_dasharray: None,
            stroke_opacity: 1.0,
        }
    }
}

/// SVG Packed Scene is dedicated struct for archive / transport format of resolved SVG file.
/// rules:
/// - size efficient: table-like structure similar to ttf
// pub struct SVGPackedScene {
//   images
//   paints
//   nodes
// }

/// Intermediate Representation of an SVG node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IRSVGNode {
    InitialContainer(IRSVGInitialContainerNode),
    Group(IRSVGGroupNode),
    Text(IRSVGTextNode),
    Path(IRSVGPathNode),
    Image(IRSVGImageNode),
}

/// <svg> (root)
/// nested <svg> will be treated as <g> (IRSVGGroupNode)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGInitialContainerNode {
    width: f32,
    height: f32,
}

/// <g>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGGroupNode {
    opacity: f32,
    blend_mode: BlendMode,
}

/// <text>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGTextNode {}

/// <path>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGPathNode {
    pub fill: Option<SVGFillAttributes>,
    pub stroke: Option<SVGStrokeAttributes>,
    pub d: String,
}

/// <image>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGImageNode {}
