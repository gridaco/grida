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
const NOTO_SANS_HK: &[u8] =
    include_bytes!("../../../fixtures/fonts/Noto_Sans_HK/NotoSansHK-VariableFont_wght.ttf");

fn draw_table_header(canvas: &skia_safe::Canvas, paint: &Paint, font_mgr: &FontMgr, y: f32) {
    let header_tf = font_mgr.new_from_data(NOTO_SANS, None).unwrap();
    let mut header_font = Font::new(header_tf, 16.0);
    header_font.set_embolden(true);

    // Draw column headers
    canvas.draw_str(
        "Font Configuration",
        Point::new(20.0, y),
        &header_font,
        paint,
    );
    canvas.draw_str("English", Point::new(280.0, y), &header_font, paint);
    canvas.draw_str("Korean", Point::new(380.0, y), &header_font, paint);
    canvas.draw_str("Japanese", Point::new(480.0, y), &header_font, paint);
    canvas.draw_str("SC", Point::new(580.0, y), &header_font, paint);
    canvas.draw_str("TC", Point::new(680.0, y), &header_font, paint);
    canvas.draw_str("HK", Point::new(780.0, y), &header_font, paint);
    canvas.draw_str("Mixed CN", Point::new(880.0, y), &header_font, paint);

    // Draw separator line
    let mut line_paint = Paint::default();
    line_paint.set_color(Color::from_argb(255, 200, 200, 200));
    line_paint.set_stroke_width(1.0);
    canvas.draw_line(
        Point::new(20.0, y + 5.0),
        Point::new(1050.0, y + 5.0),
        &line_paint,
    );
}

fn draw_table_row(
    canvas: &skia_safe::Canvas,
    paint: &Paint,
    font_mgr: &FontMgr,
    fonts: &[(&[u8], &str)],
    label: &str,
    y: f32,
) {
    let mut provider = TypefaceFontProvider::new();
    for (data, name) in fonts {
        let tf = font_mgr.new_from_data(*data, None).unwrap();
        provider.register_typeface(tf, Some(*name));
    }

    let mut collection = FontCollection::new();
    collection.set_asset_font_manager(Some(provider.into()));
    // No default font manager = no system fonts

    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    // Draw row label
    let label_tf = font_mgr.new_from_data(NOTO_SANS, None).unwrap();
    let label_font = Font::new(label_tf, 14.0);
    canvas.draw_str(label, Point::new(20.0, y), &label_font, paint);

    // Test texts for each column with Chinese variants
    // Using characters specific to each variant to show missing glyphs
    let test_texts = [
        ("Hello", 280.0),
        ("안녕하세요", 380.0),
        ("こんにちは", 480.0),
        ("简体字", 580.0), // Simplified Chinese specific: 简体字 (simplified characters)
        ("繁體字", 680.0), // Traditional Chinese specific: 繁體字 (traditional characters)
        ("粵語字", 780.0), // Hong Kong Cantonese specific: 粵語字 (Cantonese characters)
        ("简繁粵混合", 880.0), // Mixed: simplified + traditional + Cantonese
    ];

    for (text, x) in test_texts {
        let mut builder = ParagraphBuilder::new(&paragraph_style, &collection);
        let mut text_style = TextStyle::new();
        text_style.set_font_size(16.0);
        text_style.set_foreground_paint(paint);
        let families: Vec<&str> = fonts.iter().map(|(_, name)| *name).collect();
        text_style.set_font_families(&families);
        builder.push_style(&text_style);
        builder.add_text(text);

        let mut paragraph = builder.build();
        paragraph.layout(90.0); // Wider width for better text display
        paragraph.paint(canvas, Point::new(x, y - 12.0)); // Adjust y offset for alignment
    }

    // Draw row separator
    let mut line_paint = Paint::default();
    line_paint.set_color(Color::from_argb(255, 240, 240, 240));
    line_paint.set_stroke_width(0.5);
    canvas.draw_line(
        Point::new(20.0, y + 20.0),
        Point::new(1050.0, y + 20.0),
        &line_paint,
    );
}

fn main() {
    let mut surface = surfaces::raster_n32_premul((1200, 600)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    let font_mgr = FontMgr::new();

    // Title
    let title_tf = font_mgr.new_from_data(NOTO_SANS, None).unwrap();
    let mut title_font = Font::new(title_tf, 24.0);
    title_font.set_embolden(true);
    canvas.draw_str(
        "Golden Type Font Fallback - CJK Noto Fonts (System Fonts DISABLED)",
        Point::new(20.0, 30.0),
        &title_font,
        &paint,
    );

    // Subtitle
    let subtitle_tf = font_mgr.new_from_data(NOTO_SANS, None).unwrap();
    let subtitle_font = Font::new(subtitle_tf, 14.0);
    canvas.draw_str(
        "Demonstrating Noto Sans CJK font fallback behavior and character coverage",
        Point::new(20.0, 50.0),
        &subtitle_font,
        &paint,
    );

    // Draw table header
    draw_table_header(canvas, &paint, &font_mgr, 80.0);

    // Draw table rows
    let mut row_y = 110.0;
    let row_height = 30.0;

    // Row 1: Noto Sans KR only
    draw_table_row(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS_KR, "Noto Sans KR")],
        "Noto Sans KR only",
        row_y,
    );
    row_y += row_height;

    // Row 2: Noto Sans JP only
    draw_table_row(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS_JP, "Noto Sans JP")],
        "Noto Sans JP only",
        row_y,
    );
    row_y += row_height;

    // Row 3: Both KR and JP
    draw_table_row(
        canvas,
        &paint,
        &font_mgr,
        &[
            (NOTO_SANS_KR, "Noto Sans KR"),
            (NOTO_SANS_JP, "Noto Sans JP"),
        ],
        "KR + JP",
        row_y,
    );
    row_y += row_height;

    // Row 4: Noto Sans SC only
    draw_table_row(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS_SC, "Noto Sans SC")],
        "Noto Sans SC only",
        row_y,
    );
    row_y += row_height;

    // Row 5: Noto Sans TC only
    draw_table_row(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS_TC, "Noto Sans TC")],
        "Noto Sans TC only",
        row_y,
    );
    row_y += row_height;

    // Row 6: Noto Sans HK only
    draw_table_row(
        canvas,
        &paint,
        &font_mgr,
        &[(NOTO_SANS_HK, "Noto Sans HK")],
        "Noto Sans HK only",
        row_y,
    );
    row_y += row_height;

    // Row 7: All Chinese variants (SC + TC + HK)
    draw_table_row(
        canvas,
        &paint,
        &font_mgr,
        &[
            (NOTO_SANS_SC, "Noto Sans SC"),
            (NOTO_SANS_TC, "Noto Sans TC"),
            (NOTO_SANS_HK, "Noto Sans HK"),
        ],
        "SC + TC + HK",
        row_y,
    );
    row_y += row_height;

    // Row 8: Complete CJK set
    draw_table_row(
        canvas,
        &paint,
        &font_mgr,
        &[
            (NOTO_SANS_KR, "Noto Sans KR"),
            (NOTO_SANS_JP, "Noto Sans JP"),
            (NOTO_SANS_SC, "Noto Sans SC"),
            (NOTO_SANS_TC, "Noto Sans TC"),
            (NOTO_SANS_HK, "Noto Sans HK"),
        ],
        "Complete CJK set",
        row_y,
    );

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/golden_type_font_fallback_cjk_noto.png"
        ),
        data.as_bytes(),
    )
    .unwrap();

    println!("Generated golden_type_font_fallback_cjk_noto.png");
    println!("This golden test demonstrates Noto Sans CJK font fallback behavior");
    println!("Key observations:");
    println!("• Korean and Japanese fonts include Chinese characters");
    println!("• Chinese fonts (SC/TC/HK) may render same characters differently");
    println!("• Traditional Chinese (TC) and Hong Kong (HK) share many glyphs");
    println!("• Simplified Chinese (SC) uses different character forms");
    println!("• Font order matters for fallback behavior");
}
