use crate::cg::types::*;
use skia_safe;

impl From<CGColor> for skia_safe::Color {
    fn from(color: CGColor) -> Self {
        skia_safe::Color::from_argb(color.a(), color.r(), color.g(), color.b())
    }
}

impl From<BooleanPathOperation> for skia_safe::PathOp {
    fn from(op: BooleanPathOperation) -> Self {
        match op {
            BooleanPathOperation::Union => skia_safe::PathOp::Union,
            BooleanPathOperation::Intersection => skia_safe::PathOp::Intersect,
            BooleanPathOperation::Difference => skia_safe::PathOp::Difference,
            BooleanPathOperation::Xor => skia_safe::PathOp::XOR,
        }
    }
}

impl From<BlendMode> for skia_safe::BlendMode {
    fn from(mode: BlendMode) -> Self {
        use skia_safe::BlendMode::*;
        match mode {
            BlendMode::Normal => SrcOver,
            BlendMode::Multiply => Multiply,
            BlendMode::Screen => Screen,
            BlendMode::Overlay => Overlay,
            BlendMode::Darken => Darken,
            BlendMode::Lighten => Lighten,
            BlendMode::ColorDodge => ColorDodge,
            BlendMode::ColorBurn => ColorBurn,
            BlendMode::HardLight => HardLight,
            BlendMode::SoftLight => SoftLight,
            BlendMode::Difference => Difference,
            BlendMode::Exclusion => Exclusion,
            BlendMode::Hue => Hue,
            BlendMode::Saturation => Saturation,
            BlendMode::Color => Color,
            BlendMode::Luminosity => Luminosity,
            BlendMode::PassThrough => SrcOver, // fallback
        }
    }
}

impl From<TextDecoration> for skia_safe::textlayout::TextDecoration {
    fn from(mode: TextDecoration) -> Self {
        match mode {
            TextDecoration::None => skia_safe::textlayout::TextDecoration::NO_DECORATION,
            TextDecoration::Underline => skia_safe::textlayout::TextDecoration::UNDERLINE,
            TextDecoration::Overline => skia_safe::textlayout::TextDecoration::OVERLINE,
            TextDecoration::LineThrough => skia_safe::textlayout::TextDecoration::LINE_THROUGH,
        }
    }
}

impl From<TextDecorationStyle> for skia_safe::textlayout::TextDecorationStyle {
    fn from(mode: TextDecorationStyle) -> Self {
        match mode {
            TextDecorationStyle::Solid => skia_safe::textlayout::TextDecorationStyle::Solid,
            TextDecorationStyle::Double => skia_safe::textlayout::TextDecorationStyle::Double,
            TextDecorationStyle::Dotted => skia_safe::textlayout::TextDecorationStyle::Dotted,
            TextDecorationStyle::Dashed => skia_safe::textlayout::TextDecorationStyle::Dashed,
        }
    }
}

impl From<TextAlign> for skia_safe::textlayout::TextAlign {
    fn from(mode: TextAlign) -> Self {
        use skia_safe::textlayout::TextAlign::*;
        match mode {
            TextAlign::Left => Left,
            TextAlign::Right => Right,
            TextAlign::Center => Center,
            TextAlign::Justify => Justify,
        }
    }
}

impl From<Decoration> for skia_safe::textlayout::Decoration {
    fn from(decoration: Decoration) -> Self {
        skia_safe::textlayout::Decoration {
            ty: decoration.text_decoration.into(),
            // Set the decoration mode based on skip_ink setting
            // Gaps: decoration skips over descenders (g, p, q, etc.)
            // Through: decoration goes through all characters including descenders
            // FIXME: the `Gaps` mode will make non-skipping underlines to completely not draw the underline.
            // this might be a bug with skia-safe
            mode: skia_safe::textlayout::TextDecorationMode::Through,
            // mode: if decoration.text_decoration_skip_ink {
            //     skia_safe::textlayout::TextDecorationMode::Gaps
            // } else {
            //     skia_safe::textlayout::TextDecorationMode::Through
            // },
            color: decoration.text_decoration_color.into(),
            style: decoration.text_decoration_style.into(),
            thickness_multiplier: decoration.text_decoration_thinkness,
        }
    }
}
