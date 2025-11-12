use super::types::*;
use crate::cg::prelude::*;
use math2::transform::AffineTransform;
// use usvg::{LinearGradient, Paint, Pattern, RadialGradient, Stroke, Paint};

impl From<usvg::Color> for CGColor {
    fn from(color: usvg::Color) -> Self {
        CGColor::from_rgb(color.red, color.green, color.blue)
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

pub fn map_transform(transform: usvg::Transform) -> AffineTransform {
    AffineTransform::from_acebdf(
        transform.sx,
        transform.kx,
        transform.tx,
        transform.ky,
        transform.sy,
        transform.ty,
    )
}

pub fn map_transform_ref(transform: &usvg::Transform) -> AffineTransform {
    map_transform(*transform)
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

impl From<usvg::Paint> for Paint {
    fn from(paint: usvg::Paint) -> Self {
        match paint {
            usvg::Paint::Color(color) => Paint::Solid(SolidPaint::new_color(color.into())),
            usvg::Paint::LinearGradient(gradient) => Paint::LinearGradient(LinearGradientPaint {
                active: true,
                blend_mode: Default::default(),
                transform: map_transform(gradient.transform()),
                stops: gradient
                    .stops()
                    .iter()
                    .cloned()
                    .map(GradientStop::from)
                    .collect(),
                opacity: 1.0,
            }),
            usvg::Paint::RadialGradient(gradient) => Paint::RadialGradient(RadialGradientPaint {
                active: true,
                blend_mode: Default::default(),
                transform: map_transform(gradient.transform()),
                stops: gradient
                    .stops()
                    .iter()
                    .cloned()
                    .map(GradientStop::from)
                    .collect(),
                opacity: 1.0,
            }),
            // [MODEL_MISMATCH]
            // fallback to solid paint
            usvg::Paint::Pattern(_pattern) => Paint::Solid(SolidPaint::TRANSPARENT),
        }
    }
}

impl From<usvg::Stroke> for SVGStrokeAttributes {
    fn from(stroke: usvg::Stroke) -> Self {
        let paint = Paint::from(stroke.paint().clone());
        let width = stroke.width().get();
        let cap = StrokeCap::from(stroke.linecap());
        let join = StrokeJoin::from(stroke.linejoin());
        let miter_limit = StrokeMiterLimit::from(stroke.miterlimit().get());
        let dash_array = stroke
            .dasharray()
            .filter(|slice| !slice.is_empty())
            .map(|slice| StrokeDashArray(slice.to_vec()));

        SVGStrokeAttributes {
            paint,
            stroke_width: width,
            stroke_linecap: cap,
            stroke_linejoin: join,
            stroke_miterlimit: miter_limit,
            stroke_dasharray: dash_array,
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
