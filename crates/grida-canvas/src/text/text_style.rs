use crate::cg::types::*;
use skia_safe;

// pub fn decoration()

pub fn textstyle(
    style: &TextStyleRec,
    _ctx: &Option<TextStyleRecBuildContext>,
) -> skia_safe::textlayout::TextStyle {
    let mut ts = skia_safe::textlayout::TextStyle::new();
    let default_ctx = TextStyleRecBuildContext::default();
    let ctx = _ctx.as_ref().unwrap_or(&default_ctx);

    // [decoration]
    let decoration =
        TextDecoration::from_with_context(style.text_decoration.unwrap_or_default(), &ctx.into())
            .into();

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
    ts.set_decoration(&decoration);
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
