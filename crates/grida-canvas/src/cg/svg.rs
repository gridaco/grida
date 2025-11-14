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

// impl From<SVGPaint> for Paint {
//     fn from(paint: SVGPaint) -> Self {
//         match paint {
//             SVGPaint::Color(color) => Paint::Solid(SolidPaint::new_color(color.into())),
//             SVGPaint::LinearGradient(gradient) => Paint::LinearGradient(LinearGradientPaint {
//                 active: true,
//                 blend_mode: Default::default(),
//                 transform: map_transform(gradient.transform()),
//                 stops: gradient
//                     .stops()
//                     .iter()
//                     .cloned()
//                     .map(GradientStop::from)
//                     .collect(),
//                 opacity: 1.0,
//             }),
//             SVGPaint::RadialGradient(gradient) => Paint::RadialGradient(RadialGradientPaint {
//                 active: true,
//                 blend_mode: Default::default(),
//                 transform: map_transform(gradient.transform()),
//                 stops: gradient
//                     .stops()
//                     .iter()
//                     .cloned()
//                     .map(GradientStop::from)
//                     .collect(),
//                 opacity: 1.0,
//             }),
//             // [MODEL_MISMATCH]
//             // fallback to solid paint
//             SVGPaint::Pattern(_pattern) => Paint::Solid(SolidPaint::TRANSPARENT),
//         }
//     }
// }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SVGSolidPaint {
    pub color: CGColor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SVGLinearGradientPaint {
    pub id: String,
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub transform: CGTransform2D,
    pub stops: Vec<GradientStop>,
    // spread_method
    // units
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SVGRadialGradientPaint {
    pub id: String,
    pub cx: f32,
    pub cy: f32,
    pub r: f32,
    pub fx: f32,
    pub fy: f32,
    pub transform: CGTransform2D,
    pub stops: Vec<GradientStop>,
    // spread_method
    // units
}

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

impl SVGFillAttributes {
    pub fn into_paint_with_opacity(&self) -> Paint {
        svg_paint_with_opacity(&self.paint, self.fill_opacity)
    }
}

impl SVGStrokeAttributes {
    pub fn into_paint_with_opacity(&self) -> Paint {
        svg_paint_with_opacity(&self.paint, self.stroke_opacity)
    }
}

/// Helper that converts SVG paint + separate opacity fields into the runtime
/// `Paint` model (which bakes opacity into each paint entry).
///
/// SVG allows opacity on fill/stroke independently of paints; our runtime stores
/// opacity within each `Paint`. This function is the bridging layer.
fn svg_paint_with_opacity(paint: &SVGPaint, opacity: f32) -> Paint {
    match paint {
        SVGPaint::Solid(solid) => Paint::Solid(SolidPaint {
            active: true,
            color: solid.color.with_multiplier(opacity),
            blend_mode: BlendMode::Normal,
        }),
        // FIXME:
        // Gradients and patterns are not supported in this migration step.
        _ => Paint::Solid(SolidPaint {
            active: true,
            color: CGColor::TRANSPARENT,
            blend_mode: BlendMode::Normal,
        }),
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IRSVGChildNode {
    Group(IRSVGGroupNode),
    Text(IRSVGTextNode),
    Path(IRSVGPathNode),
    Image(IRSVGImageNode),
}

/// <svg> (root)
/// nested <svg> will be treated as <g> (IRSVGGroupNode)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGInitialContainerNode {
    pub width: f32,
    pub height: f32,
    pub children: Vec<IRSVGChildNode>,
}

/// <g>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGGroupNode {
    pub transform: CGTransform2D,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub children: Vec<IRSVGChildNode>,
    // filters
}

/// <text>
///
/// Incomplete PoC: stores a single flattened string plus primary fill/stroke.
/// Does not yet capture per-span styling or tspans; structure is designed to
/// expand with richer text data later.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGTextNode {
    pub transform: CGTransform2D,
    pub text_content: String,
    pub fill: Option<SVGFillAttributes>,
    pub stroke: Option<SVGStrokeAttributes>,
    pub spans: Vec<IRSVGTextSpanNode>,
}

/// <tspan>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGTextSpanNode {
    pub transform: CGTransform2D,
    pub text: String,
    pub fill: Option<SVGFillAttributes>,
    pub stroke: Option<SVGStrokeAttributes>,
    pub font_size: Option<f32>,
}

/// <path>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGPathNode {
    pub transform: CGTransform2D,
    pub fill: Option<SVGFillAttributes>,
    pub stroke: Option<SVGStrokeAttributes>,
    pub d: String,
}

/// <image>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGImageNode {}
