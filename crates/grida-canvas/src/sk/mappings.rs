use crate::cg::prelude::*;
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

impl From<TileMode> for skia_safe::TileMode {
    fn from(tile_mode: TileMode) -> Self {
        match tile_mode {
            TileMode::Clamp => skia_safe::TileMode::Clamp,
            TileMode::Repeated => skia_safe::TileMode::Repeat,
            TileMode::Mirror => skia_safe::TileMode::Mirror,
            TileMode::Decal => skia_safe::TileMode::Decal,
        }
    }
}

impl Into<skia_safe::Blender> for BlendMode {
    fn into(self) -> skia_safe::Blender {
        use skia_safe::BlendMode::*;
        let sk_blend_mode = match self {
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
        };
        skia_safe::Blender::mode(sk_blend_mode)
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
        }
    }
}

impl Into<skia_safe::PaintCap> for StrokeCap {
    fn into(self) -> skia_safe::PaintCap {
        match self {
            StrokeCap::Butt => skia_safe::PaintCap::Butt,
            StrokeCap::Round => skia_safe::PaintCap::Round,
            StrokeCap::Square => skia_safe::PaintCap::Square,
        }
    }
}

impl Into<skia_safe::PaintJoin> for StrokeJoin {
    fn into(self) -> skia_safe::PaintJoin {
        match self {
            StrokeJoin::Miter => skia_safe::PaintJoin::Miter,
            StrokeJoin::Round => skia_safe::PaintJoin::Round,
            StrokeJoin::Bevel => skia_safe::PaintJoin::Bevel,
        }
    }
}

impl From<TextDecorationLine> for skia_safe::textlayout::TextDecoration {
    fn from(mode: TextDecorationLine) -> Self {
        match mode {
            TextDecorationLine::None => skia_safe::textlayout::TextDecoration::NO_DECORATION,
            TextDecorationLine::Underline => skia_safe::textlayout::TextDecoration::UNDERLINE,
            TextDecorationLine::Overline => skia_safe::textlayout::TextDecoration::OVERLINE,
            TextDecorationLine::LineThrough => skia_safe::textlayout::TextDecoration::LINE_THROUGH,
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
            TextDecorationStyle::Wavy => skia_safe::textlayout::TextDecorationStyle::Wavy,
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

impl From<TextDecoration> for skia_safe::textlayout::Decoration {
    fn from(decoration: TextDecoration) -> Self {
        skia_safe::textlayout::Decoration {
            ty: decoration.text_decoration_line.into(),
            // Set the decoration mode based on skip_ink setting
            // Gaps: decoration skips over descenders (g, p, q, etc.)
            // Through: decoration goes through all characters including descenders
            // FIXME: the `Gaps` mode will make non-skipping underlines to completely not draw the underline.
            // see https://github.com/rust-skia/rust-skia/issues/1187
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
