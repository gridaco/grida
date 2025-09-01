use cg::cg::types::*;
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
            CGColor::from_rgb(249, 250, 251), // gray-50
            CGColor::from_rgb(243, 244, 246), // gray-100
            CGColor::from_rgb(229, 231, 235), // gray-200
            CGColor::from_rgb(209, 213, 219), // gray-300
            CGColor::from_rgb(156, 163, 175), // gray-400
            CGColor::from_rgb(107, 114, 128), // gray-500
            CGColor::from_rgb(75, 85, 99),    // gray-600
            CGColor::from_rgb(55, 65, 81),    // gray-700
            CGColor::from_rgb(31, 41, 55),    // gray-800
            CGColor::from_rgb(17, 24, 39),    // gray-900
        ],
        // Red palette
        [
            CGColor::from_rgb(254, 242, 242), // red-50
            CGColor::from_rgb(254, 226, 226), // red-100
            CGColor::from_rgb(254, 202, 202), // red-200
            CGColor::from_rgb(252, 165, 165), // red-300
            CGColor::from_rgb(248, 113, 113), // red-400
            CGColor::from_rgb(239, 68, 68),   // red-500
            CGColor::from_rgb(220, 38, 38),   // red-600
            CGColor::from_rgb(185, 28, 28),   // red-700
            CGColor::from_rgb(153, 27, 27),   // red-800
            CGColor::from_rgb(127, 29, 29),   // red-900
        ],
        // Blue palette
        [
            CGColor::from_rgb(239, 246, 255), // blue-50
            CGColor::from_rgb(219, 234, 254), // blue-100
            CGColor::from_rgb(191, 219, 254), // blue-200
            CGColor::from_rgb(147, 197, 253), // blue-300
            CGColor::from_rgb(96, 165, 250),  // blue-400
            CGColor::from_rgb(59, 130, 246),  // blue-500
            CGColor::from_rgb(37, 99, 235),   // blue-600
            CGColor::from_rgb(29, 78, 216),   // blue-700
            CGColor::from_rgb(30, 64, 175),   // blue-800
            CGColor::from_rgb(30, 58, 138),   // blue-900
        ],
        // Green palette
        [
            CGColor::from_rgb(240, 253, 244), // green-50
            CGColor::from_rgb(220, 252, 231), // green-100
            CGColor::from_rgb(187, 247, 208), // green-200
            CGColor::from_rgb(134, 239, 172), // green-300
            CGColor::from_rgb(74, 222, 128),  // green-400
            CGColor::from_rgb(34, 197, 94),   // green-500
            CGColor::from_rgb(22, 163, 74),   // green-600
            CGColor::from_rgb(21, 128, 61),   // green-700
            CGColor::from_rgb(22, 101, 52),   // green-800
            CGColor::from_rgb(20, 83, 45),    // green-900
        ],
        // Yellow palette
        [
            CGColor::from_rgb(254, 252, 232), // yellow-50
            CGColor::from_rgb(254, 249, 195), // yellow-100
            CGColor::from_rgb(254, 240, 138), // yellow-200
            CGColor::from_rgb(253, 224, 71),  // yellow-300
            CGColor::from_rgb(250, 204, 21),  // yellow-400
            CGColor::from_rgb(234, 179, 8),   // yellow-500
            CGColor::from_rgb(202, 138, 4),   // yellow-600
            CGColor::from_rgb(161, 98, 7),    // yellow-700
            CGColor::from_rgb(133, 77, 14),   // yellow-800
            CGColor::from_rgb(113, 63, 18),   // yellow-900
        ],
        // Purple palette
        [
            CGColor::from_rgb(250, 245, 255), // purple-50
            CGColor::from_rgb(243, 232, 255), // purple-100
            CGColor::from_rgb(233, 213, 255), // purple-200
            CGColor::from_rgb(216, 180, 254), // purple-300
            CGColor::from_rgb(196, 181, 253), // purple-400
            CGColor::from_rgb(168, 85, 247),  // purple-500
            CGColor::from_rgb(147, 51, 234),  // purple-600
            CGColor::from_rgb(126, 34, 206),  // purple-700
            CGColor::from_rgb(107, 33, 168),  // purple-800
            CGColor::from_rgb(88, 28, 135),   // purple-900
        ],
        // Pink palette
        [
            CGColor::from_rgb(253, 242, 248), // pink-50
            CGColor::from_rgb(252, 231, 243), // pink-100
            CGColor::from_rgb(251, 207, 232), // pink-200
            CGColor::from_rgb(249, 168, 212), // pink-300
            CGColor::from_rgb(244, 114, 182), // pink-400
            CGColor::from_rgb(236, 72, 153),  // pink-500
            CGColor::from_rgb(219, 39, 119),  // pink-600
            CGColor::from_rgb(190, 24, 93),   // pink-700
            CGColor::from_rgb(157, 23, 77),   // pink-800
            CGColor::from_rgb(131, 24, 67),   // pink-900
        ],
        // Indigo palette
        [
            CGColor::from_rgb(238, 242, 255), // indigo-50
            CGColor::from_rgb(224, 231, 255), // indigo-100
            CGColor::from_rgb(199, 210, 254), // indigo-200
            CGColor::from_rgb(165, 180, 252), // indigo-300
            CGColor::from_rgb(129, 140, 248), // indigo-400
            CGColor::from_rgb(99, 102, 241),  // indigo-500
            CGColor::from_rgb(79, 70, 229),   // indigo-600
            CGColor::from_rgb(67, 56, 202),   // indigo-700
            CGColor::from_rgb(55, 48, 163),   // indigo-800
            CGColor::from_rgb(49, 46, 129),   // indigo-900
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
    std::fs::write("goldens/colors.png", data.as_bytes()).unwrap();
}
