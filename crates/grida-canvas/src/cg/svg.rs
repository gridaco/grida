// Grida's own SVG Types (that with unique properties)

use crate::cg::prelude::*;
use math2::transform::AffineTransform;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum SVGTextAnchor {
    #[serde(rename = "start")]
    Start,
    #[serde(rename = "middle")]
    Middle,
    #[serde(rename = "end")]
    End,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum SVGPaint {
    #[serde(rename = "solid")]
    Solid(SVGSolidPaint),
    #[serde(rename = "linear-gradient")]
    LinearGradient(SVGLinearGradientPaint),
    #[serde(rename = "radial-gradient")]
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
pub struct SVGLinearGradientPaint {
    pub id: String,
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub transform: CGTransform2D,
    pub stops: Vec<GradientStop>,
    pub spread_method: SVGGradientSpreadMethod,
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
    pub spread_method: SVGGradientSpreadMethod,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum SVGGradientSpreadMethod {
    Pad,
    Reflect,
    Repeat,
}

impl From<SVGGradientSpreadMethod> for TileMode {
    fn from(spread_method: SVGGradientSpreadMethod) -> Self {
        match spread_method {
            SVGGradientSpreadMethod::Pad => TileMode::Clamp,
            SVGGradientSpreadMethod::Reflect => TileMode::Mirror,
            SVGGradientSpreadMethod::Repeat => TileMode::Repeated,
        }
    }
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
    pub fn into_paint_with_opacity(&self, bounds: Option<(f32, f32)>) -> Paint {
        svg_paint_with_opacity(&self.paint, self.fill_opacity, bounds)
    }
}

impl SVGStrokeAttributes {
    pub fn into_paint_with_opacity(&self, bounds: Option<(f32, f32)>) -> Paint {
        svg_paint_with_opacity(&self.paint, self.stroke_opacity, bounds)
    }
}

/// Helper that converts SVG paint + separate opacity fields into the runtime
/// `Paint` model (which bakes opacity into each paint entry).
///
/// SVG allows opacity on fill/stroke independently of paints; our runtime stores
/// opacity within each `Paint`. This function is the bridging layer.
fn svg_paint_with_opacity(paint: &SVGPaint, opacity: f32, bounds: Option<(f32, f32)>) -> Paint {
    match paint {
        SVGPaint::Solid(solid) => Paint::Solid(SolidPaint {
            active: true,
            color: solid.color.with_multiplier(opacity),
            blend_mode: BlendMode::Normal,
        }),
        SVGPaint::LinearGradient(linear) => svg_linear_gradient_to_paint(linear, opacity, bounds),
        SVGPaint::RadialGradient(radial) => svg_radial_gradient_to_paint(radial, opacity, bounds),
    }
}

fn svg_linear_gradient_to_paint(
    linear: &SVGLinearGradientPaint,
    opacity: f32,
    bounds: Option<(f32, f32)>,
) -> Paint {
    let xy1 = Alignment::from_uv(Uv(linear.x1, linear.y1));
    let xy2 = Alignment::from_uv(Uv(linear.x2, linear.y2));
    let mut transform = AffineTransform::from(&linear.transform);
    normalize_gradient_transform(&mut transform, bounds);

    Paint::LinearGradient(LinearGradientPaint {
        active: true,
        xy1,
        xy2,
        tile_mode: linear.spread_method.into(),
        transform,
        stops: linear.stops.clone(),
        opacity,
        blend_mode: BlendMode::Normal,
    })
}

fn svg_radial_gradient_to_paint(
    radial: &SVGRadialGradientPaint,
    opacity: f32,
    bounds: Option<(f32, f32)>,
) -> Paint {
    if (radial.fx - radial.cx).abs() > f32::EPSILON || (radial.fy - radial.cy).abs() > f32::EPSILON
    {
        return unsupported_svg_gradient("radial focal point (fx/fy)");
    }

    let mut gradient_transform = AffineTransform::from(&radial.transform);
    normalize_gradient_transform(&mut gradient_transform, bounds);
    let alignment = radial_gradient_alignment_transform((radial.cx, radial.cy), radial.r);

    Paint::RadialGradient(RadialGradientPaint {
        active: true,
        transform: gradient_transform.compose(&alignment),
        stops: radial.stops.clone(),
        opacity,
        blend_mode: BlendMode::Normal,
        tile_mode: radial.spread_method.into(),
    })
}

fn unsupported_svg_gradient(reason: &str) -> Paint {
    // TODO: Implement support for unsupported SVG gradient features:
    // - radial gradient focal points (fx/fy different from cx/cy)
    // For now, we ignore these gradients by returning an inactive paint.
    let _ = reason;
    Paint::Solid(SolidPaint {
        active: false,
        color: CGColor::TRANSPARENT,
        blend_mode: BlendMode::Normal,
    })
}

fn radial_gradient_alignment_transform(center: (f32, f32), radius: f32) -> AffineTransform {
    if radius <= f32::EPSILON {
        return AffineTransform::identity();
    }

    let translate = translation(center.0, center.1);
    let scale = scale(radius * 2.0, radius * 2.0);
    let baseline = translation(-0.5, -0.5);

    translate.compose(&scale).compose(&baseline)
}

fn normalize_gradient_transform(transform: &mut AffineTransform, bounds: Option<(f32, f32)>) {
    if let Some((width, height)) = bounds {
        if width > f32::EPSILON && height > f32::EPSILON {
            let inv_w = 1.0 / width;
            let inv_h = 1.0 / height;
            transform.matrix[0][0] *= inv_w;
            transform.matrix[0][1] *= inv_w;
            transform.matrix[0][2] *= inv_w;
            transform.matrix[1][0] *= inv_h;
            transform.matrix[1][1] *= inv_h;
            transform.matrix[1][2] *= inv_h;
        }
    }
}

fn translation(tx: f32, ty: f32) -> AffineTransform {
    AffineTransform::from_acebdf(1.0, 0.0, tx, 0.0, 1.0, ty)
}

fn scale(sx: f32, sy: f32) -> AffineTransform {
    AffineTransform::from_acebdf(sx, 0.0, 0.0, 0.0, sy, 0.0)
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
#[serde(tag = "kind")]
pub enum IRSVGNode {
    #[serde(rename = "initial-container")]
    InitialContainer(IRSVGInitialContainerNode),
    #[serde(rename = "group")]
    Group(IRSVGGroupNode),
    #[serde(rename = "text")]
    Text(IRSVGTextNode),
    #[serde(rename = "path")]
    Path(IRSVGPathNode),
    #[serde(rename = "image")]
    Image(IRSVGImageNode),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum IRSVGChildNode {
    #[serde(rename = "group")]
    Group(IRSVGGroupNode),
    #[serde(rename = "text")]
    Text(IRSVGTextNode),
    #[serde(rename = "path")]
    Path(IRSVGPathNode),
    #[serde(rename = "image")]
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
    #[serde(skip_serializing)]
    pub bounds: CGRect,
}

/// <tspan>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGTextSpanNode {
    pub transform: CGTransform2D,
    pub text: String,
    pub fill: Option<SVGFillAttributes>,
    pub stroke: Option<SVGStrokeAttributes>,
    pub font_size: Option<f32>,
    pub anchor: SVGTextAnchor,
}

/// <path>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGPathNode {
    pub transform: CGTransform2D,
    pub fill: Option<SVGFillAttributes>,
    pub stroke: Option<SVGStrokeAttributes>,
    pub d: String,
    #[serde(skip_serializing)]
    pub bounds: CGRect,
}

/// <image>
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IRSVGImageNode {}
