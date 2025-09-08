use cg::cg::types::*;
use cg::text::text_style::textstyle;
use skia_safe::textlayout::{
    FontCollection, ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection,
    TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, FontMgr, Paint, Point};

fn main() {
    // Create a larger surface to accommodate all the font feature demonstrations
    let mut surface = surfaces::raster_n32_premul((1400, 2000)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    // Load the Geist variable font which has excellent OpenType feature support
    let font_mgr = FontMgr::new();
    let geist_typeface = font_mgr
        .new_from_data(cg::fonts::embedded::geist::BYTES, None)
        .unwrap();

    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    let mut font_collection = FontCollection::new();
    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(geist_typeface, Some("Geist"));
    font_collection.set_asset_font_manager(Some(provider.into()));
    font_collection.set_default_font_manager(font_mgr, None);

    let mut builder = ParagraphBuilder::new(&paragraph_style, &font_collection);

    // Title
    let title_style = TextStyleRec::from_font("Geist", 36.0);
    let mut ts_title = textstyle(&title_style, &None);
    ts_title.set_foreground_paint(&paint);
    builder.push_style(&ts_title);
    builder.add_text("OpenType Font Features Demonstration with Geist\n\n");

    // 1. Ligatures (liga) - Standard ligatures
    builder.add_text("1. Standard Ligatures (liga)\n");

    // With ligatures enabled (default)
    let style_liga = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_liga = textstyle(&style_liga, &None);
    ts_liga.set_foreground_paint(&paint);
    builder.push_style(&ts_liga);
    builder.add_text("office flag file\n");

    // With ligatures disabled
    let style_no_liga = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "liga".to_string(),
            value: false,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_no_liga = textstyle(&style_no_liga, &None);
    ts_no_liga.set_foreground_paint(&paint);
    builder.push_style(&ts_no_liga);
    builder.add_text("office flag file\n\n");

    // 2. Discretionary Ligatures (dlig) - Optional ligatures
    builder.add_text("2. Discretionary Ligatures (dlig)\n");

    // With discretionary ligatures enabled
    let style_dlig = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "dlig".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_dlig = textstyle(&style_dlig, &None);
    ts_dlig.set_foreground_paint(&paint);
    builder.push_style(&ts_dlig);
    builder.add_text("office flag file\n");

    // Without discretionary ligatures
    let style_no_dlig = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_dlig = textstyle(&style_no_dlig, &None);
    ts_no_dlig.set_foreground_paint(&paint);
    builder.push_style(&ts_no_dlig);
    builder.add_text("office flag file\n\n");

    // 3. Contextual Alternates (calt) - Context-sensitive character substitutions
    builder.add_text("3. Contextual Alternates (calt)\n");

    // With contextual alternates enabled
    let style_calt = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "calt".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_calt = textstyle(&style_calt, &None);
    ts_calt.set_foreground_paint(&paint);
    builder.push_style(&ts_calt);
    builder.add_text("office flag file\n");

    // Without contextual alternates
    let style_no_calt = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "calt".to_string(),
            value: false,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_no_calt = textstyle(&style_no_calt, &None);
    ts_no_calt.set_foreground_paint(&paint);
    builder.push_style(&ts_no_calt);
    builder.add_text("office flag file\n\n");

    // 4. Small Caps (smcp) - Small capital letters
    builder.add_text("4. Small Caps (smcp)\n");

    // With small caps enabled
    let style_smcp = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "smcp".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_smcp = textstyle(&style_smcp, &None);
    ts_smcp.set_foreground_paint(&paint);
    builder.push_style(&ts_smcp);
    builder.add_text("office flag file\n");

    // Without small caps
    let style_no_smcp = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_smcp = textstyle(&style_no_smcp, &None);
    ts_no_smcp.set_foreground_paint(&paint);
    builder.push_style(&ts_no_smcp);
    builder.add_text("office flag file\n\n");

    // 5. Oldstyle Figures (onum) - Text figures instead of lining figures
    builder.add_text("5. Oldstyle Figures (onum)\n");

    // With oldstyle figures enabled
    let style_onum = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "onum".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_onum = textstyle(&style_onum, &None);
    ts_onum.set_foreground_paint(&paint);
    builder.push_style(&ts_onum);
    builder.add_text("1234567890\n");

    // Without oldstyle figures
    let style_no_onum = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_onum = textstyle(&style_no_onum, &None);
    ts_no_onum.set_foreground_paint(&paint);
    builder.push_style(&ts_no_onum);
    builder.add_text("1234567890\n\n");

    // 6. Tabular Figures (tnum) - Monospaced figures
    builder.add_text("6. Tabular Figures (tnum)\n");

    // With tabular figures enabled
    let style_tnum = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "tnum".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_tnum = textstyle(&style_tnum, &None);
    ts_tnum.set_foreground_paint(&paint);
    builder.push_style(&ts_tnum);
    builder.add_text("1234567890\n");

    // Without tabular figures
    let style_no_tnum = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_tnum = textstyle(&style_no_tnum, &None);
    ts_no_tnum.set_foreground_paint(&paint);
    builder.push_style(&ts_no_tnum);
    builder.add_text("1234567890\n\n");

    // 7. Slashed Zero (zero) - Zero with slash
    builder.add_text("7. Slashed Zero (zero)\n");

    // With slashed zero enabled
    let style_zero = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "zero".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_zero = textstyle(&style_zero, &None);
    ts_zero.set_foreground_paint(&paint);
    builder.push_style(&ts_zero);
    builder.add_text("0O0O0O\n");

    // Without slashed zero
    let style_no_zero = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_zero = textstyle(&style_no_zero, &None);
    ts_no_zero.set_foreground_paint(&paint);
    builder.push_style(&ts_no_zero);
    builder.add_text("0O0O0O\n\n");

    // 8. Stylistic Sets (ss01-ss20) - Alternative character sets
    builder.add_text("8. Stylistic Set 1 (ss01)\n");

    // With stylistic set 1 enabled
    let style_ss01 = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "ss01".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_ss01 = textstyle(&style_ss01, &None);
    ts_ss01.set_foreground_paint(&paint);
    builder.push_style(&ts_ss01);
    builder.add_text("office flag file\n");

    // Without stylistic set 1
    let style_no_ss01 = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_ss01 = textstyle(&style_no_ss01, &None);
    ts_no_ss01.set_foreground_paint(&paint);
    builder.push_style(&ts_no_ss01);
    builder.add_text("office flag file\n\n");

    // 9. Stylistic Set 2 (ss02) - Alternative character sets
    builder.add_text("9. Stylistic Set 2 (ss02)\n");

    // With stylistic set 2 enabled
    let style_ss02 = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "ss02".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_ss02 = textstyle(&style_ss02, &None);
    ts_ss02.set_foreground_paint(&paint);
    builder.push_style(&ts_ss02);
    builder.add_text("office flag file\n");

    // Without stylistic set 2
    let style_no_ss02 = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_ss02 = textstyle(&style_no_ss02, &None);
    ts_no_ss02.set_foreground_paint(&paint);
    builder.push_style(&ts_no_ss02);
    builder.add_text("office flag file\n\n");

    // 10. Stylistic Set 3 (ss03) - Alternative character sets
    builder.add_text("10. Stylistic Set 3 (ss03)\n");

    // With stylistic set 3 enabled
    let style_ss03 = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "ss03".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_ss03 = textstyle(&style_ss03, &None);
    ts_ss03.set_foreground_paint(&paint);
    builder.push_style(&ts_ss03);
    builder.add_text("office flag file\n");

    // Without stylistic set 3
    let style_no_ss03 = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_ss03 = textstyle(&style_no_ss03, &None);
    ts_no_ss03.set_foreground_paint(&paint);
    builder.push_style(&ts_no_ss03);
    builder.add_text("office flag file\n\n");

    // 11. Stylistic Alternates (salt) - Alternative character forms
    builder.add_text("11. Stylistic Alternates (salt)\n");

    let style_salt = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "salt".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_salt = textstyle(&style_salt, &None);
    ts_salt.set_foreground_paint(&paint);
    builder.push_style(&ts_salt);
    builder.add_text("office flag file\n");

    let style_no_salt = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_salt = textstyle(&style_no_salt, &None);
    ts_no_salt.set_foreground_paint(&paint);
    builder.push_style(&ts_no_salt);
    builder.add_text("office flag file\n\n");

    // 12. Multiple features combined
    builder.add_text("12. Multiple Features Combined\n");

    // Combining multiple features
    let style_combined = TextStyleRec {
        font_features: Some(vec![
            FontFeature {
                tag: "liga".to_string(),
                value: true,
            },
            FontFeature {
                tag: "dlig".to_string(),
                value: true,
            },
            FontFeature {
                tag: "calt".to_string(),
                value: true,
            },
            FontFeature {
                tag: "onum".to_string(),
                value: true,
            },
            FontFeature {
                tag: "zero".to_string(),
                value: true,
            },
        ]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_combined = textstyle(&style_combined, &None);
    ts_combined.set_foreground_paint(&paint);
    builder.push_style(&ts_combined);
    builder.add_text("office flag file 1234567890\n\n");

    // 13. Additional ligature examples with consistent text
    builder.add_text("13. Additional Ligature Examples\n");

    // Standard ligatures with "fi fl ff"
    let style_liga_fi = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_liga_fi = textstyle(&style_liga_fi, &None);
    ts_liga_fi.set_foreground_paint(&paint);
    builder.push_style(&ts_liga_fi);
    builder.add_text("fi fl ff\n");

    // Without ligatures
    let style_no_liga_fi = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "liga".to_string(),
            value: false,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_no_liga_fi = textstyle(&style_no_liga_fi, &None);
    ts_no_liga_fi.set_foreground_paint(&paint);
    builder.push_style(&ts_no_liga_fi);
    builder.add_text("fi fl ff\n\n");

    // 14. Discretionary ligatures with "th"
    builder.add_text("14. Discretionary Ligatures (dlig) - 'th' example\n");

    let style_dlig_th = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "dlig".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_dlig_th = textstyle(&style_dlig_th, &None);
    ts_dlig_th.set_foreground_paint(&paint);
    builder.push_style(&ts_dlig_th);
    builder.add_text("the thin\n");

    let style_no_dlig_th = TextStyleRec::from_font("Geist", 24.0);
    let mut ts_no_dlig_th = textstyle(&style_no_dlig_th, &None);
    ts_no_dlig_th.set_foreground_paint(&paint);
    builder.push_style(&ts_no_dlig_th);
    builder.add_text("the thin\n\n");

    // 15. Contextual alternates with "st"
    builder.add_text("15. Contextual Alternates (calt) - 'st' example\n");

    let style_calt_st = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "calt".to_string(),
            value: true,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_calt_st = textstyle(&style_calt_st, &None);
    ts_calt_st.set_foreground_paint(&paint);
    builder.push_style(&ts_calt_st);
    builder.add_text("first last\n");

    let style_no_calt_st = TextStyleRec {
        font_features: Some(vec![FontFeature {
            tag: "calt".to_string(),
            value: false,
        }]),
        ..TextStyleRec::from_font("Geist", 24.0)
    };
    let mut ts_no_calt_st = textstyle(&style_no_calt_st, &None);
    ts_no_calt_st.set_foreground_paint(&paint);
    builder.push_style(&ts_no_calt_st);
    builder.add_text("first last\n\n");

    // 16. Explanation text
    builder.add_text("16. Feature Explanations\n");

    let explanation_style = TextStyleRec::from_font("Geist", 16.0);
    let mut ts_explanation = textstyle(&explanation_style, &None);
    ts_explanation.set_foreground_paint(&paint);
    builder.push_style(&ts_explanation);
    builder.add_text("• liga: Standard ligatures (fi, fl, ff, etc.)\n");
    builder.add_text("• dlig: Discretionary ligatures (optional decorative ligatures)\n");
    builder.add_text("• calt: Contextual alternates (context-sensitive character substitutions)\n");
    builder.add_text("• smcp: Small caps (smaller capital letters)\n");
    builder.add_text("• onum: Oldstyle figures (text figures with varying heights)\n");
    builder.add_text("• tnum: Tabular figures (monospaced figures for alignment)\n");
    builder.add_text("• zero: Slashed zero (zero with diagonal slash)\n");
    builder.add_text("• ss01-ss20: Stylistic sets (alternative character designs)\n");
    builder.add_text("• salt: Stylistic alternates (alternative character forms)\n");
    builder.add_text("• swsh: Swash characters (decorative character variants)\n");
    builder.add_text("• hist: Historical forms (historical character variants)\n");

    let mut paragraph = builder.build();
    paragraph.layout(1360.0);
    paragraph.paint(canvas, Point::new(20.0, 40.0));

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/type_font_features.png", data.as_bytes()).unwrap();
}
