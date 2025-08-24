use skia_safe::textlayout::*;
use skia_safe::{surfaces, Color, FontMgr, Paint, PaintStyle, Point};

static GEIST_VARIABLE_TTF: &[u8] = include_bytes!("../fonts/Geist/Geist-VariableFont_wght.ttf");

/// Configuration for paragraph styling
#[derive(Debug, Clone)]
pub struct ParagraphConfig {
    pub font_size: f32,
    pub line_height: Option<f32>,
    pub font_family: String,
    pub text_color: Color,
    pub text_align: TextAlign,
    pub show_baselines: bool,
    pub show_bounding_box: bool,
    pub show_handles: bool,
    pub baseline_color: Color,
    pub bounding_box_color: Color,
    pub handle_color: Color,
}

impl Default for ParagraphConfig {
    fn default() -> Self {
        Self {
            font_size: 16.0,
            line_height: None,
            font_family: "Geist".to_string(),
            text_color: Color::BLACK,
            text_align: TextAlign::Left,
            show_baselines: true,
            show_bounding_box: true,
            show_handles: true,
            baseline_color: Color::from_argb(180, 0, 122, 255), // Consistent blue
            bounding_box_color: Color::from_argb(120, 255, 59, 48), // Consistent red
            handle_color: Color::from_argb(200, 0, 122, 255),   // Consistent blue
        }
    }
}

/// Paints a paragraph with line metrics visualization
pub fn paint_paragraph_with_linemetrics(
    canvas: &skia_safe::Canvas,
    text: &str,
    position: Point,
    max_width: f32,
    font_collection: &FontCollection,
    config: &ParagraphConfig,
) -> skia_safe::Rect {
    // Create paragraph style
    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_align(config.text_align);
    paragraph_style.set_text_direction(TextDirection::LTR);

    // Create paragraph builder
    let mut builder = ParagraphBuilder::new(&paragraph_style, font_collection);

    // Create text style
    let mut text_style = TextStyle::new();
    text_style.set_font_size(config.font_size);
    text_style.set_color(config.text_color);
    text_style.set_font_families(&[&config.font_family]);

    // Set line height if specified
    if let Some(line_height) = config.line_height {
        text_style.set_height(line_height);
    }

    // Add text to paragraph
    builder.push_style(&text_style);
    builder.add_text(text);
    builder.pop();

    // Build and layout the paragraph
    let mut paragraph = builder.build();
    paragraph.layout(max_width);

    // Draw the paragraph
    paragraph.paint(canvas, position);

    // Draw baselines if enabled
    if config.show_baselines {
        let mut baseline_paint = Paint::default();
        baseline_paint.set_color(config.baseline_color);
        baseline_paint.set_style(PaintStyle::Stroke);
        baseline_paint.set_stroke_width(1.0);
        baseline_paint.set_anti_alias(true);

        let lines = paragraph.line_number();
        for i in 0..lines {
            if let Some(line_metrics) = paragraph.get_line_metrics_at(i) {
                let baseline_y = position.y + line_metrics.baseline as f32;
                let line_start_x = position.x;
                let line_end_x = position.x + paragraph.max_width();

                canvas.draw_line(
                    Point::new(line_start_x, baseline_y),
                    Point::new(line_end_x, baseline_y),
                    &baseline_paint,
                );
            }
        }
    }

    // Calculate paragraph bounds
    let paragraph_bounds = skia_safe::Rect::from_xywh(
        position.x,
        position.y,
        paragraph.max_width(),
        paragraph.height(),
    );

    // Draw bounding box if enabled
    if config.show_bounding_box {
        let mut bounding_box_paint = Paint::default();
        bounding_box_paint.set_color(config.bounding_box_color);
        bounding_box_paint.set_style(PaintStyle::Stroke);
        bounding_box_paint.set_stroke_width(2.0);
        bounding_box_paint.set_anti_alias(true);
        canvas.draw_rect(paragraph_bounds, &bounding_box_paint);
    }

    // Draw selection handles if enabled
    if config.show_handles {
        let mut handle_paint = Paint::default();
        handle_paint.set_color(config.handle_color);
        handle_paint.set_style(PaintStyle::Fill);
        handle_paint.set_anti_alias(true);

        let handle_size = 6.0;
        let handles = [
            (paragraph_bounds.left, paragraph_bounds.top),
            (paragraph_bounds.right, paragraph_bounds.top),
            (paragraph_bounds.left, paragraph_bounds.bottom),
            (paragraph_bounds.right, paragraph_bounds.bottom),
        ];

        for (x, y) in handles {
            let handle_rect = skia_safe::Rect::from_xywh(
                x - handle_size / 2.0,
                y - handle_size / 2.0,
                handle_size,
                handle_size,
            );
            canvas.draw_rect(handle_rect, &handle_paint);
        }
    }

    paragraph_bounds
}

fn main() {
    let (width, height) = (600, 800);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Create font manager and load the Geist font
    let font_mgr = FontMgr::new();
    let typeface = font_mgr.new_from_data(GEIST_VARIABLE_TTF, None).unwrap();

    // Create font collection and add the Geist font
    let mut font_collection = FontCollection::new();
    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(typeface, Some("Geist"));
    font_collection.set_asset_font_manager(Some(provider.into()));
    font_collection.set_default_font_manager(font_mgr.clone(), None);

    let test_text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

    let mut y_offset = 40.0;

    // Test 1: Small font, tight line height
    println!("Test 1: Small font (12px), tight line height (1.2)");
    let mut config1 = ParagraphConfig::default();
    config1.font_size = 12.0;
    config1.line_height = Some(1.2);
    let bounds1 = paint_paragraph_with_linemetrics(
        canvas,
        test_text,
        Point::new(20.0, y_offset),
        width as f32 - 40.0,
        &font_collection,
        &config1,
    );
    y_offset = bounds1.bottom + 30.0;

    // Test 2: Medium font, default line height
    println!("Test 2: Medium font (18px), default line height");
    let mut config2 = ParagraphConfig::default();
    config2.font_size = 18.0;
    let bounds2 = paint_paragraph_with_linemetrics(
        canvas,
        test_text,
        Point::new(20.0, y_offset),
        width as f32 - 40.0,
        &font_collection,
        &config2,
    );
    y_offset = bounds2.bottom + 30.0;

    // Test 3: Large font, loose line height
    println!("Test 3: Large font (24px), loose line height (1.8)");
    let mut config3 = ParagraphConfig::default();
    config3.font_size = 24.0;
    config3.line_height = Some(1.8);
    let bounds3 = paint_paragraph_with_linemetrics(
        canvas,
        test_text,
        Point::new(20.0, y_offset),
        width as f32 - 40.0,
        &font_collection,
        &config3,
    );
    y_offset = bounds3.bottom + 30.0;

    // Test 4: Very large font, no line height specified
    println!("Test 4: Very large font (32px), no line height specified");
    let mut config4 = ParagraphConfig::default();
    config4.font_size = 32.0;
    paint_paragraph_with_linemetrics(
        canvas,
        test_text,
        Point::new(20.0, y_offset),
        width as f32 - 40.0,
        &font_collection,
        &config4,
    );

    // Save the result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write("goldens/sk_paragraph_linemetrics.png", data.as_bytes()).unwrap();

    println!("Test completed! Check goldens/sk_paragraph_linemetrics.png for the result.");
    println!("The demo shows how the function works with different font sizes and line heights:");
    println!("- Test 1: Small font (12px) with tight line height (1.2)");
    println!("- Test 2: Medium font (18px) with default line height");
    println!("- Test 3: Large font (24px) with loose line height (1.8)");
    println!("- Test 4: Very large font (32px) with no line height specified");
    println!(
        "All annotations use consistent colors: blue for baselines/handles, red for bounding boxes"
    );
}
