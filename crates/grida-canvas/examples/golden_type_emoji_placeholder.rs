use cg::cg::types::*;
use cg::text::text_style::textstyle;
use skia_safe::canvas::SrcRectConstraint;
use skia_safe::textlayout::{
    FontCollection, ParagraphBuilder, ParagraphStyle, PlaceholderAlignment, PlaceholderStyle,
    TextAlign, TextBaseline, TextDirection, TypefaceFontProvider,
};
use skia_safe::{surfaces, Color, Data, FontMgr, Image, Paint, Point, Rect};

// Layout constants - easy to customize
static MARGIN: f32 = 40.0;

// Static emoji data - embedded at compile time
static EMOJI_DATA: [(&char, &'static [u8]); 7] = [
    (
        &'❤',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/2764.png"),
    ),
    (
        &'⭐',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/2b50.png"),
    ),
    (
        &'👍',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f44d.png"),
    ),
    (
        &'💩',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f4a9.png"),
    ),
    (
        &'💰',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f4b0.png"),
    ),
    (
        &'💻',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f4bb.png"),
    ),
    (
        &'🔗',
        include_bytes!("../../../fixtures/apple-emoji-linux/160/1f517.png"),
    ),
];

// Dynamic text parser that converts emoji characters to placeholders
fn parse_text_with_emojis(text: &str) -> Vec<TextRun> {
    let mut runs = Vec::new();
    let mut current_text = String::new();

    for c in text.chars() {
        if EMOJI_DATA.iter().any(|(emoji_char, _)| **emoji_char == c) {
            // Flush current text if any
            if !current_text.is_empty() {
                runs.push(TextRun::Text(current_text.clone()));
                current_text.clear();
            }
            // Add emoji placeholder
            runs.push(TextRun::Emoji(c));
        } else {
            current_text.push(c);
        }
    }

    // Add remaining text
    if !current_text.is_empty() {
        runs.push(TextRun::Text(current_text));
    }

    runs
}

#[derive(Clone)]
enum TextRun {
    Text(String),
    Emoji(char),
}

fn main() {
    // Create surface and canvas
    let mut surface = surfaces::raster_n32_premul((600, 800)).unwrap();
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Prepare paint
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLACK);

    // Load font
    let font_mgr = FontMgr::new();
    let geist = font_mgr
        .new_from_data(cg::fonts::embedded::geist::BYTES, None)
        .unwrap();

    let mut paragraph_style = ParagraphStyle::new();
    paragraph_style.set_text_direction(TextDirection::LTR);
    paragraph_style.set_text_align(TextAlign::Left);

    let mut font_collection = FontCollection::new();
    let mut provider = TypefaceFontProvider::new();
    provider.register_typeface(geist, Some("Geist"));
    font_collection.set_asset_font_manager(Some(provider.into()));

    let mut builder = ParagraphBuilder::new(&paragraph_style, &font_collection);
    let mut style = TextStyleRec::from_font("Geist", 36.0);
    style.text_decoration = Some(TextDecorationRec {
        text_decoration_line: TextDecorationLine::Underline,
        text_decoration_color: Some(CGColor::BLUE),
        text_decoration_style: None,
        text_decoration_skip_ink: None,
        text_decoration_thinkness: None,
    });
    let mut ts = textstyle(&style, &None);
    ts.set_foreground_paint(&paint);
    builder.push_style(&ts);

    let placeholder = PlaceholderStyle {
        width: 36.0,
        height: 36.0,
        alignment: PlaceholderAlignment::Baseline,
        baseline: TextBaseline::Alphabetic,
        baseline_offset: 0.0,
    };

    // Dynamic text with emojis - intentionally including one missing emoji to show "notdef" behavior
    let dynamic_text =
        "Paragraph ⭐ with ❤️ placeholder 👍 Emoji 💩 pngs 💰 in 💻 the 🔗 middle. And it's normal that 🚀 <- this won't show";

    // Parse the text into runs
    let text_runs = parse_text_with_emojis(dynamic_text);

    // Build the paragraph dynamically
    for run in &text_runs {
        match run {
            TextRun::Text(text) => {
                let _ = builder.add_text(text);
            }
            TextRun::Emoji(_) => {
                let _ = builder.add_placeholder(&placeholder);
            }
        }
    }

    let mut paragraph = builder.build();
    // Calculate layout width based on canvas width and padding
    let layout_width = 600.0 - (MARGIN * 2.0); // Canvas width - left and right padding
    paragraph.layout(layout_width);
    let origin = Point::new(MARGIN, 60.0);
    paragraph.paint(canvas, origin);

    // Draw emoji images over placeholders
    let rects = paragraph.get_rects_for_placeholders();

    // Emoji data is now defined as static constants at the top of the file

    // Sort placeholders by their position (line first, then left position within line)
    let mut sorted_rects: Vec<_> = rects.iter().enumerate().collect();
    sorted_rects.sort_by(|a, b| {
        // First sort by line (top position), then by left position within the line
        let line_a = a.1.rect.top();
        let line_b = b.1.rect.top();
        if (line_a - line_b).abs() < 1.0 {
            // Same line, sort by left position
            a.1.rect.left().partial_cmp(&b.1.rect.left()).unwrap()
        } else {
            // Different lines, sort by line (top position)
            line_a.partial_cmp(&line_b).unwrap()
        }
    });

    // Draw each emoji in its placeholder
    for (sorted_idx, (_original_idx, text_box)) in sorted_rects.iter().enumerate() {
        // Find the corresponding emoji from the parsed text runs
        let emoji_char = if let Some(TextRun::Emoji(c)) = text_runs
            .iter()
            .filter(|run| matches!(run, TextRun::Emoji(_)))
            .nth(sorted_idx)
        {
            *c
        } else {
            continue; // Skip if no more emojis
        };

        let emoji_bytes = EMOJI_DATA
            .iter()
            .find(|(char_ref, _)| **char_ref == emoji_char)
            .expect("Emoji not found in data")
            .1;

        let mut dst = text_box.rect.clone();
        dst.offset((origin.x, origin.y));

        // Simple approach: find the closest line baseline to this placeholder
        let placeholder_y = text_box.rect.top();
        let text_baseline_y = if paragraph.line_number() > 0 {
            let mut closest_baseline = None;
            let mut min_distance = f32::INFINITY;

            for line_idx in 0..paragraph.line_number() {
                if let Some(line_metrics) = paragraph.get_line_metrics_at(line_idx) {
                    let line_baseline_y = origin.y + line_metrics.baseline as f32;
                    // Calculate distance from placeholder to this line's baseline
                    let distance = (placeholder_y - (line_baseline_y - 36.0)).abs();
                    if distance < min_distance {
                        min_distance = distance;
                        closest_baseline = Some(line_baseline_y);
                    }
                }
            }
            closest_baseline.unwrap_or(origin.y + 36.0)
        } else {
            origin.y + 36.0
        };

        // Position emoji to align with text baseline
        let emoji_size = 36.0; // Keep emoji at reasonable size
        let center_x = dst.left() + (dst.width() - emoji_size) / 2.0;

        let emoji_bottom_y = text_baseline_y;
        let emoji_top_y = emoji_bottom_y - emoji_size;

        let baseline_aligned_dst =
            Rect::new(center_x, emoji_top_y, center_x + emoji_size, emoji_bottom_y);

        let emoji = Image::from_encoded(Data::new_copy(emoji_bytes)).unwrap();
        let src = Rect::new(0.0, 0.0, emoji.width() as f32, emoji.height() as f32);
        canvas.draw_image_rect(
            &emoji,
            Some((&src, SrcRectConstraint::Fast)),
            baseline_aligned_dst,
            &Paint::default(),
        );
    }

    // Save result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/type_emoji_placeholder.png", data.as_bytes()).unwrap();
}
