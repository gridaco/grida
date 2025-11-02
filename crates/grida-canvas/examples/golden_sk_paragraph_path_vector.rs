//! Golden test demonstrating Skia paragraph-to-path conversion
//!
//! This example showcases text-to-path conversion using Skia's built-in features,
//! converting typography into vector paths that can be rendered as shapes.
//! Features multiple font scenarios including variable fonts, multi-script text,
//! and demonstrates integration with Grida Canvas's vector network system.
//!
//! ## Features Demonstrated
//! - Variable font weight and style variations
//! - Multi-script text rendering (Latin, CJK, Emoji)
//! - Path conversion with proper curve handling
//! - Vector network integration with fills and strokes
//! - Typography showcase with rich content

use cg::cg::prelude::*;
use cg::vectornetwork::{StrokeOptions, VNPainter, VectorNetwork};
use skia_safe::{
    self as sk,
    font_style::{Slant, Weight, Width},
    path::AddPathMode,
    surfaces,
    textlayout::{
        FontCollection, Paragraph, ParagraphBuilder, ParagraphStyle, TextAlign, TextStyle,
        TypefaceFontProvider,
    },
    Color, Data, FontMgr, Path, Point,
};

fn main() {
    let (width, height) = (1440, 1600);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();

    // Create a subtle gradient background
    let background_paint = sk::Paint::new(sk::Color4f::new(0.98, 0.98, 1.0, 1.0), None);
    canvas.draw_rect(
        sk::Rect::new(0.0, 0.0, width as f32, height as f32),
        &background_paint,
    );

    // Add title and description
    draw_title_and_description(canvas);

    // Draw scenarios with proper spacing and alignment
    let y_offset = 180.0;
    let y_offset = scenario_geist(canvas, y_offset);
    let y_offset = scenario_roboto_flex(canvas, y_offset);
    let y_offset = scenario_multiscript(canvas, y_offset);
    let _y_offset = scenario_variable_fonts(canvas, y_offset);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, sk::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/sk_paragraph_path_vector.png"
        ),
        data.as_bytes(),
    )
    .unwrap();
}

fn draw_title_and_description(canvas: &sk::Canvas) {
    let font_mgr = FontMgr::new();
    let default_typeface = font_mgr
        .match_family_style("Arial", sk::FontStyle::default())
        .unwrap_or_else(|| {
            font_mgr
                .match_family_style("", sk::FontStyle::default())
                .unwrap()
        });

    // Draw title
    let mut title_paint = sk::Paint::new(sk::Color4f::new(0.1, 0.1, 0.1, 1.0), None);
    title_paint.set_anti_alias(true);

    let mut title_font = sk::Font::new(default_typeface.clone(), Some(32.0));
    title_font.set_embolden(true);

    canvas.draw_str(
        "Typography to Vector Paths",
        Point::new(50.0, 50.0),
        &title_font,
        &title_paint,
    );

    // Draw subtitle
    let mut subtitle_paint = sk::Paint::new(sk::Color4f::new(0.4, 0.4, 0.4, 1.0), None);
    subtitle_paint.set_anti_alias(true);

    let subtitle_font = sk::Font::new(default_typeface.clone(), Some(16.0));
    canvas.draw_str(
        "Demonstrating Skia paragraph-to-path conversion with Grida Canvas",
        Point::new(50.0, 75.0),
        &subtitle_font,
        &subtitle_paint,
    );

    // Draw feature list
    let features = [
        "• Variable font weight and style variations",
        "• Multi-script text rendering (Latin, CJK, Emoji)",
        "• Path conversion with proper curve handling",
        "• Vector network integration with fills and strokes",
    ];

    let feature_font = sk::Font::new(default_typeface, Some(12.0));
    let mut feature_paint = sk::Paint::new(sk::Color4f::new(0.5, 0.5, 0.5, 1.0), None);
    feature_paint.set_anti_alias(true);

    for (i, feature) in features.iter().enumerate() {
        canvas.draw_str(
            feature,
            Point::new(50.0, 100.0 + i as f32 * 16.0),
            &feature_font,
            &feature_paint,
        );
    }
}

fn draw_section_label(canvas: &sk::Canvas, label: &str, x: f32, y: f32) {
    let font_mgr = FontMgr::new();
    let default_typeface = font_mgr
        .match_family_style("Arial", sk::FontStyle::default())
        .unwrap_or_else(|| {
            font_mgr
                .match_family_style("", sk::FontStyle::default())
                .unwrap()
        });

    let mut label_font = sk::Font::new(default_typeface, Some(14.0));
    label_font.set_embolden(true);

    let mut label_paint = sk::Paint::new(sk::Color4f::new(0.2, 0.2, 0.2, 1.0), None);
    label_paint.set_anti_alias(true);

    canvas.draw_str(label, Point::new(x, y), &label_font, &label_paint);
}

fn scenario_geist(canvas: &sk::Canvas, y_offset: f32) -> f32 {
    draw_section_label(
        canvas,
        "Geist Variable Font - Weight Variations",
        50.0,
        y_offset,
    );

    let font_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/fonts/Geist/Geist-VariableFont_wght.ttf"
    );
    let font_mgr = FontMgr::new();
    let typeface = font_mgr
        .new_from_data(&Data::new_copy(&std::fs::read(font_path).unwrap()), None)
        .expect("typeface");

    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(typeface, Some("Geist"));

    let mut collection = FontCollection::new();
    collection.set_asset_font_manager(Some(provider.into()));
    collection.set_default_font_manager(font_mgr, None);

    // Multiple weight variations
    let weights = [
        (Weight::THIN, "Thin", CGColor::from_rgba(100, 100, 255, 255)),
        (Weight::LIGHT, "Light", CGColor::from_rgba(0, 150, 255, 255)),
        (
            Weight::NORMAL,
            "Regular",
            CGColor::from_rgba(0, 128, 255, 255),
        ),
        (Weight::BOLD, "Bold", CGColor::from_rgba(0, 100, 200, 255)),
        (Weight::BLACK, "Black", CGColor::from_rgba(0, 80, 160, 255)),
    ];

    let mut current_y = y_offset + 30.0;
    for (weight, label, color) in weights {
        let mut style = ParagraphStyle::new();
        style.set_text_align(TextAlign::Left);
        let mut builder = ParagraphBuilder::new(&style, &collection);

        let mut text_style = TextStyle::new();
        text_style.set_font_size(48.0);
        text_style.set_font_style(skia_safe::FontStyle::new(
            weight,
            Width::NORMAL,
            Slant::Upright,
        ));
        text_style.set_font_families(&["Geist"]);
        let CGColor(r, g, b, _) = color;
        text_style.set_color(Color::from_argb(255, r, g, b));
        builder.push_style(&text_style);
        builder.add_text(&format!("Geist {} - Typography Excellence", label));

        let mut paragraph = builder.build();
        paragraph.layout(3400.0);

        if let Some(path) = paragraph_to_path(&mut paragraph, Point::new(50.0, current_y)) {
            let vn = VectorNetwork::from(&path);
            let painter = VNPainter::new(canvas);
            let fill = Paint::from(color);
            let stroke = StrokeOptions {
                stroke_width: 1.5,
                stroke_align: StrokeAlign::Center,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                paints: Paints::new([Paint::from(CGColor::from_rgba(0, 0, 0, 100))]),
                width_profile: None,
                stroke_dash_array: None,
            };
            painter.draw(&vn, &[fill], Some(&stroke), 0.0);
        }
        current_y += 70.0;
    }

    current_y + 20.0
}

fn scenario_roboto_flex(canvas: &sk::Canvas, y_offset: f32) -> f32 {
    draw_section_label(canvas, "Roboto Flex - Style Variations", 50.0, y_offset);

    let font_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/fonts/Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );
    let font_mgr = FontMgr::new();
    let typeface = font_mgr
        .new_from_data(&Data::new_copy(&std::fs::read(font_path).unwrap()), None)
        .expect("typeface");

    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(typeface, Some("Roboto Flex"));

    let mut collection = FontCollection::new();
    collection.set_asset_font_manager(Some(provider.into()));
    collection.set_default_font_manager(font_mgr, None);

    // Style variations showcasing different weights, widths, and slants
    let styles = [
        (
            Weight::LIGHT,
            Width::EXPANDED,
            Slant::Upright,
            "Light Expanded",
            CGColor::from_rgba(255, 100, 150, 255),
        ),
        (
            Weight::NORMAL,
            Width::NORMAL,
            Slant::Upright,
            "Regular",
            CGColor::from_rgba(200, 50, 150, 255),
        ),
        (
            Weight::BOLD,
            Width::CONDENSED,
            Slant::Upright,
            "Bold Condensed",
            CGColor::from_rgba(180, 0, 120, 255),
        ),
        (
            Weight::BLACK,
            Width::NORMAL,
            Slant::Italic,
            "Black Italic",
            CGColor::from_rgba(150, 0, 100, 255),
        ),
    ];

    let mut current_y = y_offset + 30.0;
    for (weight, width, slant, label, color) in styles {
        let mut style = ParagraphStyle::new();
        style.set_text_align(TextAlign::Left);
        let mut builder = ParagraphBuilder::new(&style, &collection);

        let mut text_style = TextStyle::new();
        text_style.set_font_size(42.0);
        text_style.set_font_style(skia_safe::FontStyle::new(weight, width, slant));
        text_style.set_font_families(&["Roboto Flex"]);
        let CGColor(r, g, b, _) = color;
        text_style.set_color(Color::from_argb(255, r, g, b));
        builder.push_style(&text_style);
        builder.add_text(&format!("Roboto Flex {} - Flexible Typography", label));

        let mut paragraph = builder.build();
        paragraph.layout(3400.0);

        if let Some(path) = paragraph_to_path(&mut paragraph, Point::new(50.0, current_y)) {
            let vn = VectorNetwork::from(&path);
            let painter = VNPainter::new(canvas);
            let fill = Paint::from(color);
            let stroke = StrokeOptions {
                stroke_width: 1.5,
                stroke_align: StrokeAlign::Center,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                paints: Paints::new([Paint::from(CGColor::from_rgba(0, 0, 0, 100))]),
                width_profile: None,
                stroke_dash_array: None,
            };
            painter.draw(&vn, &[fill], Some(&stroke), 0.0);
        }
        current_y += 65.0;
    }

    current_y + 20.0
}

fn scenario_multiscript(canvas: &sk::Canvas, y_offset: f32) -> f32 {
    draw_section_label(
        canvas,
        "Multi-Script Typography - International Text",
        50.0,
        y_offset,
    );

    let paths = [
        (
            "Noto Sans",
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../fixtures/fonts/Noto_Sans/NotoSans-VariableFont_wdth,wght.ttf"
            ),
        ),
        (
            "Noto Sans JP",
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../fixtures/fonts/Noto_Sans_JP/NotoSansJP-VariableFont_wght.ttf"
            ),
        ),
        (
            "Noto Color Emoji",
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../fixtures/fonts/Noto_Color_Emoji/NotoColorEmoji-Regular.ttf"
            ),
        ),
    ];
    let font_mgr = FontMgr::new();
    let mut provider = TypefaceFontProvider::new();
    for &(name, path) in &paths {
        let data = std::fs::read(path).unwrap();
        let tf = font_mgr
            .new_from_data(&Data::new_copy(&data), None)
            .expect("typeface");
        provider.register_typeface(tf, Some(name));
    }
    let mut collection = FontCollection::new();
    collection.set_asset_font_manager(Some(provider.into()));
    collection.set_default_font_manager(font_mgr, None);

    // Rich multilingual content
    let multilingual_texts = [
        (
            "Hello 世界! 🌍 Welcome to Typography",
            CGColor::from_rgba(50, 150, 200, 255),
        ),
        (
            "مرحبا بالعالم! مرحبا بك في الطباعة",
            CGColor::from_rgba(100, 180, 100, 255),
        ),
        (
            "Привет мир! Добро пожаловать в типографику",
            CGColor::from_rgba(200, 100, 150, 255),
        ),
        (
            "Hola mundo! ¡Bienvenido a la tipografía! 🎨",
            CGColor::from_rgba(180, 120, 80, 255),
        ),
    ];

    let mut current_y = y_offset + 30.0;
    for (text, color) in multilingual_texts {
        let mut style = ParagraphStyle::new();
        style.set_text_align(TextAlign::Left);
        let mut builder = ParagraphBuilder::new(&style, &collection);

        let mut text_style = TextStyle::new();
        text_style.set_font_size(36.0);
        text_style.set_font_style(skia_safe::FontStyle::new(
            Weight::NORMAL,
            Width::NORMAL,
            Slant::Upright,
        ));
        let CGColor(r, g, b, _) = color;
        text_style.set_color(Color::from_argb(255, r, g, b));
        text_style.set_font_families(&["Noto Sans", "Noto Sans JP", "Noto Color Emoji"]);
        builder.push_style(&text_style);
        builder.add_text(text);

        let mut paragraph = builder.build();
        paragraph.layout(3400.0);

        if let Some(path) = paragraph_to_path(&mut paragraph, Point::new(50.0, current_y)) {
            let vn = VectorNetwork::from(&path);
            let painter = VNPainter::new(canvas);
            let fill = Paint::from(color);
            let stroke = StrokeOptions {
                stroke_width: 1.0,
                stroke_align: StrokeAlign::Center,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                paints: Paints::new([Paint::from(CGColor::from_rgba(0, 0, 0, 80))]),
                width_profile: None,
                stroke_dash_array: None,
            };
            painter.draw(&vn, &[fill], Some(&stroke), 0.0);
        }
        current_y += 55.0;
    }

    current_y + 20.0
}

fn scenario_variable_fonts(canvas: &sk::Canvas, y_offset: f32) -> f32 {
    draw_section_label(
        canvas,
        "Variable Font Features - Advanced Typography",
        50.0,
        y_offset,
    );

    // Try to load a variable font if available, otherwise use system font
    let font_mgr = FontMgr::new();
    let mut collection = FontCollection::new();
    collection.set_default_font_manager(font_mgr, None);

    // Showcase different typographic features
    let features = [
        (
            "Variable Font Weight",
            CGColor::from_rgba(255, 100, 50, 255),
            Weight::BOLD,
        ),
        (
            "Different Font Sizes",
            CGColor::from_rgba(100, 200, 100, 255),
            Weight::NORMAL,
        ),
        (
            "Typography Showcase",
            CGColor::from_rgba(100, 100, 255, 255),
            Weight::MEDIUM,
        ),
        (
            "Advanced Text Rendering",
            CGColor::from_rgba(200, 150, 50, 255),
            Weight::SEMI_BOLD,
        ),
    ];

    let mut current_y = y_offset + 30.0;
    for (text, color, weight) in features {
        let mut style = ParagraphStyle::new();
        style.set_text_align(TextAlign::Left);
        let mut builder = ParagraphBuilder::new(&style, &collection);

        let mut text_style = TextStyle::new();
        text_style.set_font_size(40.0);
        text_style.set_font_style(skia_safe::FontStyle::new(
            weight,
            Width::NORMAL,
            Slant::Upright,
        ));
        let CGColor(r, g, b, _) = color;
        text_style.set_color(Color::from_argb(255, r, g, b));
        builder.push_style(&text_style);
        builder.add_text(text);

        let mut paragraph = builder.build();
        paragraph.layout(3400.0);

        if let Some(path) = paragraph_to_path(&mut paragraph, Point::new(50.0, current_y)) {
            let vn = VectorNetwork::from(&path);
            let painter = VNPainter::new(canvas);
            let fill = Paint::from(color);
            let stroke = StrokeOptions {
                stroke_width: 1.2,
                stroke_align: StrokeAlign::Center,
                stroke_cap: StrokeCap::default(),
                stroke_join: StrokeJoin::default(),
                paints: Paints::new([Paint::from(CGColor::from_rgba(0, 0, 0, 120))]),
                width_profile: None,
                stroke_dash_array: None,
            };
            painter.draw(&vn, &[fill], Some(&stroke), 0.0);
        }
        current_y += 60.0;
    }

    current_y + 20.0
}

fn paragraph_to_path(paragraph: &mut Paragraph, origin: Point) -> Option<Path> {
    let mut path = Path::new();
    paragraph.visit(|_, run| {
        if let Some(run) = run {
            let font = run.font();
            let glyphs = run.glyphs();
            let positions = run.positions();
            let run_origin = run.origin();
            for (glyph, pos) in glyphs.iter().zip(positions.iter()) {
                if let Some(glyph_path) = font.get_path(*glyph) {
                    let offset = Point::new(
                        pos.x + run_origin.x + origin.x,
                        pos.y + run_origin.y + origin.y,
                    );
                    path.add_path(&glyph_path, offset, AddPathMode::Append);
                }
            }
        }
    });
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}
