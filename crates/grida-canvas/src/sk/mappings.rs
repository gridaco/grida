use crate::cg::types::*;
use skia_safe;

pub trait ToSkPath {
    fn to_path(&self) -> skia_safe::Path;
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
