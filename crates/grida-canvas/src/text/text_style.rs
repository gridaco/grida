use crate::cg::types::*;
use skia_safe;

fn decoration(style: &TextStyle) -> skia_safe::textlayout::Decoration {
    let color: skia_safe::Color = style
        .text_decoration_color
        .unwrap_or(
            // TODO: get the color args
            CGColor::BLACK,
        )
        .into();

    let mode = if style.text_decoration_skip_ink.unwrap_or(true) {
        skia_safe::textlayout::TextDecorationMode::Gaps
    } else {
        skia_safe::textlayout::TextDecorationMode::Gaps
    };

    skia_safe::textlayout::Decoration {
        ty: style.text_decoration.into(),
        mode: mode,
        color: color,
        style: style.text_decoration_style.unwrap_or_default().into(),
        thickness_multiplier: style.text_decoration_thinkness.unwrap_or(1.0),
    }
}

pub fn textstyle(style: &TextStyle) -> skia_safe::textlayout::TextStyle {
    let mut ts = skia_safe::textlayout::TextStyle::new();

    // [decoration]
    let decor = decoration(style);

    // [font_style]
    let font_style = skia_safe::FontStyle::new(
        skia_safe::font_style::Weight::from(style.font_weight.value() as i32),
        skia_safe::font_style::Width::NORMAL,
        if style.italic {
            skia_safe::font_style::Slant::Italic
        } else {
            skia_safe::font_style::Slant::Upright
        },
    );

    // [variables]

    // [wght]
    let wght = var_wght(style.font_weight.value() as f32);
    let variation_position = skia_safe::font_arguments::VariationPosition {
        coordinates: &[wght],
    };
    let font_args =
        skia_safe::FontArguments::new().set_variation_design_position(variation_position);

    //
    ts.set_font_size(style.font_size);
    if let Some(letter_spacing) = style.letter_spacing {
        ts.set_letter_spacing(letter_spacing);
    }
    if let Some(line_height) = style.line_height {
        ts.set_height(line_height);
    }
    ts.set_decoration(&decor);
    ts.set_font_families(&[&style.font_family]);
    ts.set_font_arguments(&font_args);
    ts.set_font_style(font_style);
    ts
}

fn var_wght(weight: f32) -> skia_safe::font_arguments::variation_position::Coordinate {
    skia_safe::font_arguments::variation_position::Coordinate {
        axis: skia_safe::FourByteTag::from(('w', 'g', 'h', 't')),
        value: weight,
    }
}
