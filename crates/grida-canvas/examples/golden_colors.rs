use cg::cg::prelude::*;
use skia_safe::{surfaces, Color, Font, FontMgr, Paint, Rect};

fn main() {
    // Create a surface to draw on
    let (width, height) = (1000, 1000);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Tailwind color palettes
    let tailwind_colors = [
        // Gray palette
        [
            CGColor::from_rgba(249, 250, 251, 255), // gray-50
            CGColor::from_rgba(243, 244, 246, 255), // gray-100
            CGColor::from_rgba(229, 231, 235, 255), // gray-200
            CGColor::from_rgba(209, 213, 219, 255), // gray-300
            CGColor::from_rgba(156, 163, 175, 255), // gray-400
            CGColor::from_rgba(107, 114, 128, 255), // gray-500
            CGColor::from_rgba(75, 85, 99, 255),    // gray-600
            CGColor::from_rgba(55, 65, 81, 255),    // gray-700
            CGColor::from_rgba(31, 41, 55, 255),    // gray-800
            CGColor::from_rgba(17, 24, 39, 255),    // gray-900
        ],
        // Red palette
        [
            CGColor::from_rgba(254, 242, 242, 255), // red-50
            CGColor::from_rgba(254, 226, 226, 255), // red-100
            CGColor::from_rgba(254, 202, 202, 255), // red-200
            CGColor::from_rgba(252, 165, 165, 255), // red-300
            CGColor::from_rgba(248, 113, 113, 255), // red-400
            CGColor::from_rgba(239, 68, 68, 255),   // red-500
            CGColor::from_rgba(220, 38, 38, 255),   // red-600
            CGColor::from_rgba(185, 28, 28, 255),   // red-700
            CGColor::from_rgba(153, 27, 27, 255),   // red-800
            CGColor::from_rgba(127, 29, 29, 255),   // red-900
        ],
        // Blue palette
        [
            CGColor::from_rgba(239, 246, 255, 255), // blue-50
            CGColor::from_rgba(219, 234, 254, 255), // blue-100
            CGColor::from_rgba(191, 219, 254, 255), // blue-200
            CGColor::from_rgba(147, 197, 253, 255), // blue-300
            CGColor::from_rgba(96, 165, 250, 255),  // blue-400
            CGColor::from_rgba(59, 130, 246, 255),  // blue-500
            CGColor::from_rgba(37, 99, 235, 255),   // blue-600
            CGColor::from_rgba(29, 78, 216, 255),   // blue-700
            CGColor::from_rgba(30, 64, 175, 255),   // blue-800
            CGColor::from_rgba(30, 58, 138, 255),   // blue-900
        ],
        // Green palette
        [
            CGColor::from_rgba(240, 253, 244, 255), // green-50
            CGColor::from_rgba(220, 252, 231, 255), // green-100
            CGColor::from_rgba(187, 247, 208, 255), // green-200
            CGColor::from_rgba(134, 239, 172, 255), // green-300
            CGColor::from_rgba(74, 222, 128, 255),  // green-400
            CGColor::from_rgba(34, 197, 94, 255),   // green-500
            CGColor::from_rgba(22, 163, 74, 255),   // green-600
            CGColor::from_rgba(21, 128, 61, 255),   // green-700
            CGColor::from_rgba(22, 101, 52, 255),   // green-800
            CGColor::from_rgba(20, 83, 45, 255),    // green-900
        ],
        // Yellow palette
        [
            CGColor::from_rgba(254, 252, 232, 255), // yellow-50
            CGColor::from_rgba(254, 249, 195, 255), // yellow-100
            CGColor::from_rgba(254, 240, 138, 255), // yellow-200
            CGColor::from_rgba(253, 224, 71, 255),  // yellow-300
            CGColor::from_rgba(250, 204, 21, 255),  // yellow-400
            CGColor::from_rgba(234, 179, 8, 255),   // yellow-500
            CGColor::from_rgba(202, 138, 4, 255),   // yellow-600
            CGColor::from_rgba(161, 98, 7, 255),    // yellow-700
            CGColor::from_rgba(133, 77, 14, 255),   // yellow-800
            CGColor::from_rgba(113, 63, 18, 255),   // yellow-900
        ],
        // Purple palette
        [
            CGColor::from_rgba(250, 245, 255, 255), // purple-50
            CGColor::from_rgba(243, 232, 255, 255), // purple-100
            CGColor::from_rgba(233, 213, 255, 255), // purple-200
            CGColor::from_rgba(216, 180, 254, 255), // purple-300
            CGColor::from_rgba(196, 181, 253, 255), // purple-400
            CGColor::from_rgba(168, 85, 247, 255),  // purple-500
            CGColor::from_rgba(147, 51, 234, 255),  // purple-600
            CGColor::from_rgba(126, 34, 206, 255),  // purple-700
            CGColor::from_rgba(107, 33, 168, 255),  // purple-800
            CGColor::from_rgba(88, 28, 135, 255),   // purple-900
        ],
        // Pink palette
        [
            CGColor::from_rgba(253, 242, 248, 255), // pink-50
            CGColor::from_rgba(252, 231, 243, 255), // pink-100
            CGColor::from_rgba(251, 207, 232, 255), // pink-200
            CGColor::from_rgba(249, 168, 212, 255), // pink-300
            CGColor::from_rgba(244, 114, 182, 255), // pink-400
            CGColor::from_rgba(236, 72, 153, 255),  // pink-500
            CGColor::from_rgba(219, 39, 119, 255),  // pink-600
            CGColor::from_rgba(190, 24, 93, 255),   // pink-700
            CGColor::from_rgba(157, 23, 77, 255),   // pink-800
            CGColor::from_rgba(131, 24, 67, 255),   // pink-900
        ],
        // Indigo palette
        [
            CGColor::from_rgba(238, 242, 255, 255), // indigo-50
            CGColor::from_rgba(224, 231, 255, 255), // indigo-100
            CGColor::from_rgba(199, 210, 254, 255), // indigo-200
            CGColor::from_rgba(165, 180, 252, 255), // indigo-300
            CGColor::from_rgba(129, 140, 248, 255), // indigo-400
            CGColor::from_rgba(99, 102, 241, 255),  // indigo-500
            CGColor::from_rgba(79, 70, 229, 255),   // indigo-600
            CGColor::from_rgba(67, 56, 202, 255),   // indigo-700
            CGColor::from_rgba(55, 48, 163, 255),   // indigo-800
            CGColor::from_rgba(49, 46, 129, 255),   // indigo-900
        ],
    ];

    let palette_names = [
        "Gray", "Red", "Blue", "Green", "Yellow", "Purple", "Pink", "Indigo",
    ];

    let shade_labels = [
        "50", "100", "200", "300", "400", "500", "600", "700", "800", "900",
    ];

    let square_size = 50.0;
    let margin = 15.0;
    let label_width = 100.0;
    let header_height = 50.0;
    let start_x = 50.0;
    let start_y = 100.0;
    let corner_radius = 8.0;

    // Load Geist font
    let font_data = cg::fonts::embedded::geist::BYTES;
    let font_mgr = FontMgr::new();
    let typeface = font_mgr.new_from_data(font_data, None).unwrap();

    // Draw column headers (shade labels)
    let mut header_paint = Paint::default();
    header_paint.set_anti_alias(true);
    header_paint.set_color(Color::BLACK);

    let header_font = Font::new(typeface.clone(), 14.0);

    for (shade_index, shade_label) in shade_labels.iter().enumerate() {
        let x = start_x + label_width + (shade_index as f32 * (square_size + margin));
        let y = start_y - header_height;

        canvas.draw_str(
            shade_label,
            skia_safe::Point::new(x + square_size / 2.0 - 10.0, y + 25.0),
            &header_font,
            &header_paint,
        );
    }

    // Draw row labels (color names)
    let mut label_paint = Paint::default();
    label_paint.set_anti_alias(true);
    label_paint.set_color(Color::BLACK);

    let label_font = Font::new(typeface.clone(), 16.0);

    // Draw each color palette as a row
    for (palette_index, (colors, name)) in
        tailwind_colors.iter().zip(palette_names.iter()).enumerate()
    {
        let row_y = start_y + (palette_index as f32 * (square_size + margin));

        // Draw row label
        canvas.draw_str(
            name,
            skia_safe::Point::new(start_x + 10.0, row_y + square_size / 2.0 + 5.0),
            &label_font,
            &label_paint,
        );

        // Draw each color in the palette as a column
        for (color_index, color) in colors.iter().enumerate() {
            let x = start_x + label_width + (color_index as f32 * (square_size + margin));
            let y = row_y;

            // Create paint for the color square
            let mut paint = Paint::default();
            paint.set_anti_alias(true);
            paint.set_color(skia_safe::Color::from(*color));

            // Draw the rounded 50x50 square
            let rect = Rect::from_xywh(x, y, square_size, square_size);
            let rrect = skia_safe::RRect::new_rect_radii(
                rect,
                &[
                    skia_safe::Point::new(corner_radius, corner_radius),
                    skia_safe::Point::new(corner_radius, corner_radius),
                    skia_safe::Point::new(corner_radius, corner_radius),
                    skia_safe::Point::new(corner_radius, corner_radius),
                ],
            );
            canvas.draw_rrect(&rrect, &paint);

            // Draw semi-transparent border for better visibility
            let mut border_paint = Paint::default();
            border_paint.set_anti_alias(true);
            border_paint.set_color(Color::from_argb(60, 0, 0, 0));
            border_paint.set_style(skia_safe::PaintStyle::Stroke);
            border_paint.set_stroke_width(1.5);

            canvas.draw_rrect(&rrect, &border_paint);
        }
    }

    // Draw title
    let mut title_paint = Paint::default();
    title_paint.set_anti_alias(true);
    title_paint.set_color(Color::BLACK);

    let title_font = Font::new(typeface, 24.0);

    canvas.draw_str(
        "Tailwind Color Table",
        skia_safe::Point::new(start_x, start_y - 60.0),
        &title_font,
        &title_paint,
    );

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/colors.png"),
        data.as_bytes(),
    )
    .unwrap();
}
