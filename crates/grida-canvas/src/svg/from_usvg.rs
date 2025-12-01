// NOTE: This module only contains conversion utilities (Into/From) between usvg
// primitives and our SVG IR / core CG types. Scene construction lives elsewhere.

use crate::cg::prelude::*;

impl From<usvg::Color> for CGColor {
    fn from(color: usvg::Color) -> Self {
        CGColor::from_rgb(color.red, color.green, color.blue)
    }
}

impl From<usvg::Rect> for CGRect {
    fn from(rect: usvg::Rect) -> Self {
        CGRect {
            x: rect.x(),
            y: rect.y(),
            width: rect.width(),
            height: rect.height(),
        }
    }
}

impl From<usvg::BlendMode> for BlendMode {
    fn from(blend_mode: usvg::BlendMode) -> Self {
        match blend_mode {
            usvg::BlendMode::Normal => BlendMode::Normal,
            usvg::BlendMode::Multiply => BlendMode::Multiply,
            usvg::BlendMode::Screen => BlendMode::Screen,
            usvg::BlendMode::Overlay => BlendMode::Overlay,
            usvg::BlendMode::Darken => BlendMode::Darken,
            usvg::BlendMode::Lighten => BlendMode::Lighten,
            usvg::BlendMode::ColorDodge => BlendMode::ColorDodge,
            usvg::BlendMode::ColorBurn => BlendMode::ColorBurn,
            usvg::BlendMode::HardLight => BlendMode::HardLight,
            usvg::BlendMode::SoftLight => BlendMode::SoftLight,
            usvg::BlendMode::Difference => BlendMode::Difference,
            usvg::BlendMode::Exclusion => BlendMode::Exclusion,
            usvg::BlendMode::Hue => BlendMode::Hue,
            usvg::BlendMode::Saturation => BlendMode::Saturation,
            usvg::BlendMode::Color => BlendMode::Color,
            usvg::BlendMode::Luminosity => BlendMode::Luminosity,
        }
    }
}

impl From<usvg::MaskType> for ImageMaskType {
    fn from(mask_type: usvg::MaskType) -> Self {
        match mask_type {
            usvg::MaskType::Luminance => ImageMaskType::Luminance,
            usvg::MaskType::Alpha => ImageMaskType::Alpha,
        }
    }
}

impl From<usvg::FillRule> for FillRule {
    fn from(fill_rule: usvg::FillRule) -> Self {
        match fill_rule {
            usvg::FillRule::NonZero => FillRule::NonZero,
            usvg::FillRule::EvenOdd => FillRule::EvenOdd,
        }
    }
}

impl From<usvg::TextAnchor> for SVGTextAnchor {
    fn from(text_anchor: usvg::TextAnchor) -> Self {
        match text_anchor {
            usvg::TextAnchor::Start => SVGTextAnchor::Start,
            usvg::TextAnchor::Middle => SVGTextAnchor::Middle,
            usvg::TextAnchor::End => SVGTextAnchor::End,
        }
    }
}

impl From<usvg::StrokeMiterlimit> for StrokeMiterLimit {
    fn from(miterlimit: usvg::StrokeMiterlimit) -> Self {
        StrokeMiterLimit::new(miterlimit.get())
    }
}

impl From<usvg::StrokeWidth> for StrokeWidth {
    fn from(stroke_width: usvg::StrokeWidth) -> Self {
        StrokeWidth::Uniform(stroke_width.get())
    }
}

impl From<usvg::LineCap> for StrokeCap {
    fn from(line_cap: usvg::LineCap) -> Self {
        match line_cap {
            usvg::LineCap::Butt => StrokeCap::Butt,
            usvg::LineCap::Round => StrokeCap::Round,
            usvg::LineCap::Square => StrokeCap::Square,
        }
    }
}

impl From<usvg::LineJoin> for StrokeJoin {
    fn from(line_join: usvg::LineJoin) -> Self {
        match line_join {
            usvg::LineJoin::Miter => StrokeJoin::Miter,
            usvg::LineJoin::Round => StrokeJoin::Round,
            usvg::LineJoin::Bevel => StrokeJoin::Bevel,
            // [MODEL_MISMATCH]
            usvg::LineJoin::MiterClip => StrokeJoin::Miter,
        }
    }
}

impl From<usvg::Transform> for CGTransform2D {
    fn from(transform: usvg::Transform) -> Self {
        CGTransform2D::new(
            transform.sx,
            transform.kx,
            transform.tx,
            transform.ky,
            transform.sy,
            transform.ty,
        )
    }
}

impl From<usvg::Stop> for GradientStop {
    fn from(value: usvg::Stop) -> Self {
        GradientStop {
            offset: value.offset().get(),
            color: value.color().into(),
            // [MODEL_MISMATCH]
            // opacity: value.opacity().get(),
        }
    }
}

struct UsvgStops<'a>(&'a [usvg::Stop]);

impl From<UsvgStops<'_>> for Vec<GradientStop> {
    fn from(stops: UsvgStops<'_>) -> Self {
        stops.0.iter().cloned().map(GradientStop::from).collect()
    }
}

impl From<&usvg::LinearGradient> for SVGLinearGradientPaint {
    fn from(gradient: &usvg::LinearGradient) -> Self {
        SVGLinearGradientPaint {
            id: gradient.id().to_string(),
            x1: gradient.x1(),
            y1: gradient.y1(),
            x2: gradient.x2(),
            y2: gradient.y2(),
            transform: gradient.transform().into(),
            stops: Vec::<GradientStop>::from(UsvgStops(gradient.stops())),
            spread_method: gradient.spread_method().into(),
        }
    }
}

impl From<&usvg::RadialGradient> for SVGRadialGradientPaint {
    fn from(gradient: &usvg::RadialGradient) -> Self {
        SVGRadialGradientPaint {
            id: gradient.id().to_string(),
            cx: gradient.cx(),
            cy: gradient.cy(),
            r: gradient.r().get(),
            fx: gradient.fx(),
            fy: gradient.fy(),
            transform: gradient.transform().into(),
            stops: Vec::<GradientStop>::from(UsvgStops(gradient.stops())),
            spread_method: gradient.spread_method().into(),
        }
    }
}

impl From<&usvg::Paint> for SVGPaint {
    fn from(paint: &usvg::Paint) -> Self {
        match paint {
            usvg::Paint::Color(color) => SVGPaint::Solid(SVGSolidPaint {
                color: (*color).into(),
            }),
            usvg::Paint::LinearGradient(gradient) => {
                SVGPaint::LinearGradient(gradient.as_ref().into())
            }
            usvg::Paint::RadialGradient(gradient) => {
                SVGPaint::RadialGradient(gradient.as_ref().into())
            }
            // [MODEL_MISMATCH]
            // fallback to solid paint
            usvg::Paint::Pattern(_pattern) => SVGPaint::TRANSPARENT,
        }
    }
}

impl From<usvg::Stroke> for SVGStrokeAttributes {
    fn from(stroke: usvg::Stroke) -> Self {
        SVGStrokeAttributes {
            paint: stroke.paint().into(),
            stroke_opacity: stroke.opacity().get(),
            stroke_width: stroke.width().get(),
            stroke_linecap: stroke.linecap().into(),
            stroke_linejoin: stroke.linejoin().into(),
            stroke_miterlimit: stroke.miterlimit().into(),
            stroke_dasharray: stroke
                .dasharray()
                .map(|slice| StrokeDashArray(slice.to_vec())),
        }
    }
}

impl From<&usvg::Fill> for SVGFillAttributes {
    fn from(fill: &usvg::Fill) -> Self {
        SVGFillAttributes {
            paint: SVGPaint::from(fill.paint()),
            fill_opacity: fill.opacity().get(),
            fill_rule: fill.rule().into(),
        }
    }
}

impl From<&usvg::Stroke> for SVGStrokeAttributes {
    fn from(stroke: &usvg::Stroke) -> Self {
        stroke.clone().into()
    }
}

impl From<usvg::SpreadMethod> for SVGGradientSpreadMethod {
    fn from(method: usvg::SpreadMethod) -> Self {
        match method {
            usvg::SpreadMethod::Pad => SVGGradientSpreadMethod::Pad,
            usvg::SpreadMethod::Reflect => SVGGradientSpreadMethod::Reflect,
            usvg::SpreadMethod::Repeat => SVGGradientSpreadMethod::Repeat,
        }
    }
}

// [MODEL_MISMATCH]
// impl From<usvg::Fill> for Fill {
//     fn from(fill: usvg::Fill) -> Self {
//         // - fill.opacity
//         // - fill.rule
//         // - fill.paint
//     }
// }

// [MODEL_MISMATCH]
// impl From<usvg::ClipPath> for ??
