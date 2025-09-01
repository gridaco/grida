use skia_safe::textlayout::{
    FontCollection, ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TextStyle,
    TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, Font, FontMgr, Paint, Point};

const NOTO_SANS: &[u8] =
    include_bytes!("../../../fixtures/fonts/Noto_Sans/NotoSans-VariableFont_wdth,wght.ttf");
const NOTO_SANS_KR: &[u8] =
    include_bytes!("../../../fixtures/fonts/Noto_Sans_KR/NotoSansKR-VariableFont_wght.ttf");
const NOTO_SANS_JP: &[u8] =
    include_bytes!("../../../fixtures/fonts/Noto_Sans_JP/NotoSansJP-VariableFont_wght.ttf");
const NOTO_SANS_SC: &[u8] =
    include_bytes!("../../../fixtures/fonts/Noto_Sans_SC/NotoSansSC-VariableFont_wght.ttf");
const NOTO_SANS_TC: &[u8] =
    include_bytes!("../../../fixtures/fonts/Noto_Sans_TC/NotoSansTC-VariableFont_wght.ttf");
const NOTO_SANS_HEBREW: &[u8] = include_bytes!(
    "../../../fixtures/fonts/Noto_Sans_Hebrew/NotoSansHebrew-VariableFont_wdth,wght.ttf"
);

fn draw_paragraph(
    canvas: &skia_safe::Canvas,
    paint: &Paint,
    font_mgr: &FontMgr,
    fonts: &[(&[u8], &str)],
    label: &str,
    y: f32,
    text: &str,
    use_system_fonts: bool,
) {
    let mut provider = TypefaceFontProvider::new();
    for (data, name) in fonts {
        let tf = font_mgr.new_from_data(*data, None).unwrap();
        provider.register_typeface(tf, Some(*name));
    }

    let mut collection = FontCollection::new();
    collection.set_asset_font_manager(Some(provider.into()));

    // Only set default font manager if system fonts should be used
    if use_system_fonts {
        collection.set_default_font_manager(font_mgr.clone(), None);
    }
    // When not set, only the explicitly registered fonts will be available

    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    let mut builder = ParagraphBuilder::new(&paragraph_style, &collection);
    let mut text_style = TextStyle::new();
    text_style.set_font_size(24.0);
    text_style.set_foreground_paint(paint);
    let families: Vec<&str> = fonts.iter().map(|(_, name)| *name).collect();
    text_style.set_font_families(&families);
    // Set font weight to make text more readable
    text_style.set_font_style(skia_safe::FontStyle::new(
        skia_safe::font_style::Weight::NORMAL,
        skia_safe::font_style::Width::NORMAL,
        skia_safe::font_style::Slant::Upright,
    ));
    builder.push_style(&text_style);
    builder.add_text(text);

    let mut paragraph = builder.build();
    paragraph.layout(1160.0);
    paragraph.paint(canvas, Point::new(20.0, y));

    // draw label above paragraph
    let label_tf = font_mgr.new_from_data(NOTO_SANS, None).unwrap();
    let mut label_font = Font::new(label_tf, 18.0);
    label_font.set_embolden(true); // Make labels bold for better visibility
    canvas.draw_str(label, Point::new(20.0, y - 10.0), &label_font, paint);
}

fn main() {
    let mut surface = surfaces::raster_n32_premul((1200, 1400)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    let font_mgr = FontMgr::new();
    let text = "Hello שלום 안녕하세요 こんにちは 你好 繁體";

    // Title
    let title_tf = font_mgr.new_from_data(NOTO_SANS, None).unwrap();
    let mut title_font = Font::new(title_tf, 24.0);
    title_font.set_embolden(true); // Make title bold

    let section_tf = font_mgr.new_from_data(NOTO_SANS, None).unwrap();
    let mut section_font = Font::new(section_tf, 18.0);
    section_font.set_embolden(true); // Make section titles bold
    canvas.draw_str(
        "Font Fallback Demo - System Fonts DISABLED",
        Point::new(20.0, 30.0),
        &title_font,
        &paint,
    );

    // ============================================================================
    // SECTION 1: Noto Sans only
    // ============================================================================
    let section1_y = 100.0;
    canvas.draw_str(
        "SECTION 1: Noto Sans only",
        Point::new(20.0, section1_y - 20.0),
        &section_font,
        &paint,
    );

    draw_paragraph(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS, "Noto Sans")],
        "Noto Sans (no system fallback)",
        section1_y + 20.0,
        text,
        false, // No system fonts
    );

    // ============================================================================
    // SECTION 2: Noto Sans + each CJK font individually
    // ============================================================================
    let section2_y = 240.0;
    canvas.draw_str(
        "SECTION 2: Noto Sans + each CJK font individually",
        Point::new(20.0, section2_y - 20.0),
        &section_font,
        &paint,
    );

    draw_paragraph(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS, "Noto Sans"), (NOTO_SANS_KR, "Noto Sans KR")],
        "Noto Sans + KR only",
        section2_y + 20.0,
        text,
        false, // No system fonts
    );

    draw_paragraph(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS, "Noto Sans"), (NOTO_SANS_JP, "Noto Sans JP")],
        "Noto Sans + JP only",
        section2_y + 140.0,
        text,
        false, // No system fonts
    );

    draw_paragraph(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS, "Noto Sans"), (NOTO_SANS_SC, "Noto Sans SC")],
        "Noto Sans + SC only",
        section2_y + 260.0,
        text,
        false, // No system fonts
    );

    draw_paragraph(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS, "Noto Sans"), (NOTO_SANS_TC, "Noto Sans TC")],
        "Noto Sans + TC only",
        section2_y + 380.0,
        text,
        false, // No system fonts
    );

    draw_paragraph(
        canvas,
        &paint,
        &font_mgr,
        &[
            (NOTO_SANS, "Noto Sans"),
            (NOTO_SANS_HEBREW, "Noto Sans Hebrew"),
        ],
        "Noto Sans + Hebrew only",
        section2_y + 500.0,
        text,
        false, // No system fonts
    );

    // ============================================================================
    // SECTION 3: All together with and without system fallback
    // ============================================================================
    let section3_y = 880.0;
    canvas.draw_str(
        "SECTION 3: All together",
        Point::new(20.0, section3_y - 20.0),
        &section_font,
        &paint,
    );

    draw_paragraph(
        canvas,
        &paint,
        &font_mgr,
        &[
            (NOTO_SANS, "Noto Sans"),
            (NOTO_SANS_KR, "Noto Sans KR"),
            (NOTO_SANS_JP, "Noto Sans JP"),
            (NOTO_SANS_SC, "Noto Sans SC"),
            (NOTO_SANS_TC, "Noto Sans TC"),
            (NOTO_SANS_HEBREW, "Noto Sans Hebrew"),
        ],
        "All Noto Sans fonts (no system fallback)",
        section3_y + 20.0,
        text,
        false, // No system fonts
    );

    draw_paragraph(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS, "Noto Sans")],
        "A Noto Sans font with System fallback",
        section3_y + 140.0,
        text,
        true, // With system fonts
    );

    // Test with non-existent font family to show fallback behavior
    let mut provider = TypefaceFontProvider::new();
    let tf = font_mgr.new_from_data(NOTO_SANS, None).unwrap();
    provider.register_typeface(tf, Some("Noto Sans"));

    let mut collection = FontCollection::new();
    collection.set_asset_font_manager(Some(provider.into()));
    // No default font manager = no system fonts

    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    let mut builder = ParagraphBuilder::new(&paragraph_style, &collection);
    let mut text_style = TextStyle::new();
    text_style.set_font_size(16.0);
    text_style.set_foreground_paint(&paint);
    text_style.set_font_families(&["NonExistentFont", "AlsoNonExistent"]);
    builder.push_style(&text_style);
    builder.add_text("This text uses non-existent fonts - should show fallback behavior");

    let mut paragraph = builder.build();
    paragraph.layout(1160.0);
    paragraph.paint(canvas, Point::new(20.0, 1200.0));

    // Label for the fallback test
    let label_tf = font_mgr.new_from_data(NOTO_SANS, None).unwrap();
    let mut label_font = Font::new(label_tf, 18.0);
    label_font.set_embolden(true); // Make label bold for better visibility
    canvas.draw_str(
        "Non-existent fonts (no system fallback)",
        Point::new(20.0, 1190.0),
        &label_font,
        &paint,
    );

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        "goldens/golden_type_font_fallback_script.png",
        data.as_bytes(),
    )
    .unwrap();

    println!("Generated golden_type_font_fallback_script.png");
    println!("This demo shows how to disable system fonts in Skia by not calling set_default_font_manager()");
    println!("When system fonts are disabled, only explicitly registered fonts are available for fallback");
}
