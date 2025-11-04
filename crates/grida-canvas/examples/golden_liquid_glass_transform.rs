/*! Liquid Glass Transform Demonstrations
 *
 * This example demonstrates the liquid glass effect with various transformations
 * including rotation and mixed corner radii using the SaveLayer backdrop approach.
 *
 * Grid Layout (2400x2400):
 * - Row 1: Uniform corners, All different radii, Half corners rounded
 * - Row 2: 45° rotation, 90° rotation, 180° rotation  
 * - Row 3: -45° rotation + mixed, Asymmetric corners, Asymmetric corners
 */

use cg::cg::prelude::*;
use cg::painter::effects;
use skia_safe::{
    canvas::SaveLayerRec, surfaces, Color, Data, EncodedImageFormat, Font, FontMgr, Image, Paint,
    Rect, Surface,
};

const BACKGROUND_IMAGE: &[u8] = include_bytes!("../../../fixtures/images/stripes.png");

fn main() {
    let canvas_size = (2400, 2400);
    let grid_cols = 3;
    let grid_rows = 3;
    let cell_width = canvas_size.0 as f32 / grid_cols as f32;
    let cell_height = canvas_size.1 as f32 / grid_rows as f32;

    // Create surface
    let mut surface = surfaces::raster_n32_premul(canvas_size).expect("surface");

    // Load and draw background image (tiled if needed)
    let background_image =
        Image::from_encoded(Data::new_copy(BACKGROUND_IMAGE)).expect("decode background image");
    surface.canvas().draw_image_rect(
        &background_image,
        None,
        Rect::from_xywh(0.0, 0.0, canvas_size.0 as f32, canvas_size.1 as f32),
        &Paint::default(),
    );

    // Load font for labels
    let font_data = cg::fonts::embedded::geist::BYTES;
    let font_mgr = FontMgr::new();
    let typeface = font_mgr.new_from_data(font_data, None).unwrap();
    let font = Font::new(typeface, 32.0);

    // Glass effect parameters
    let effect = FeLiquidGlass::default();

    // Define grid cells with their configurations
    let demos = [
        // Row 1
        ("Uniform\nRadius 50px", [50.0, 50.0, 50.0, 50.0], 0.0),
        (
            "All Different\n[80, 40, 20, 60]",
            [80.0, 40.0, 20.0, 60.0],
            0.0,
        ),
        ("Half Rounded\n[60, 60, 0, 0]", [60.0, 60.0, 0.0, 0.0], 0.0),
        // Row 2
        ("45° Rotation", [50.0, 50.0, 50.0, 50.0], 45.0),
        ("90° Rotation", [50.0, 50.0, 50.0, 50.0], 90.0),
        ("180° Rotation", [50.0, 50.0, 50.0, 50.0], 180.0),
        // Row 3
        (
            "-45° + Mixed\n[70, 30, 70, 30]",
            [70.0, 30.0, 70.0, 30.0],
            -45.0,
        ),
        (
            "Asymmetric 1\n[90, 10, 90, 10]",
            [90.0, 10.0, 90.0, 10.0],
            0.0,
        ),
        (
            "Asymmetric 2\n[20, 80, 20, 80]",
            [20.0, 80.0, 20.0, 80.0],
            0.0,
        ),
    ];

    // Draw each grid cell
    for (idx, (label, radii, rotation)) in demos.iter().enumerate() {
        let row = idx / grid_cols;
        let col = idx % grid_cols;

        let cell_x = col as f32 * cell_width;
        let cell_y = row as f32 * cell_height;

        draw_grid_cell(
            &mut surface,
            cell_x,
            cell_y,
            cell_width,
            cell_height,
            *radii,
            *rotation,
            label,
            &font,
            &effect,
        );
    }

    // Draw grid lines (get canvas reference after all surface mutations)
    let canvas = surface.canvas();
    draw_grid_lines(canvas, canvas_size, grid_cols, grid_rows);

    // Save to PNG
    let image = surface.image_snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/goldens/liquid_glass_transform.png"
        ),
        data.as_bytes(),
    )
    .expect("write png");
}

/// Draw a single grid cell with liquid glass effect
fn draw_grid_cell(
    surface: &mut Surface,
    cell_x: f32,
    cell_y: f32,
    cell_width: f32,
    cell_height: f32,
    corner_radii: [f32; 4],
    rotation: f32,
    label: &str,
    font: &Font,
    effect: &FeLiquidGlass,
) {
    // Glass dimensions (centered in cell with padding)
    let padding = 100.0;
    let glass_width = cell_width - 2.0 * padding;
    let glass_height = cell_height - 2.0 * padding;
    let glass_x = cell_x + padding;
    let glass_y = cell_y + padding;

    let canvas = surface.canvas();

    // Create glass ImageFilter using backdrop approach
    let glass_filter = effects::create_liquid_glass_image_filter(
        glass_width,
        glass_height,
        corner_radii,
        rotation,
        (2400.0, 2400.0), // Full canvas size for proper coordinate mapping
        effect,
    );

    // Apply glass using SaveLayer with backdrop
    canvas.save();
    canvas.translate((glass_x, glass_y));

    // Clip to glass bounds (rectangle with per-corner rounded corners)
    let glass_rect = Rect::from_xywh(0.0, 0.0, glass_width, glass_height);
    let corner_points: [skia_safe::Point; 4] = [
        (corner_radii[0], corner_radii[0]).into(), // top-left
        (corner_radii[1], corner_radii[1]).into(), // top-right
        (corner_radii[2], corner_radii[2]).into(), // bottom-right
        (corner_radii[3], corner_radii[3]).into(), // bottom-left
    ];
    let rrect = skia_safe::RRect::new_rect_radii(glass_rect, &corner_points);
    canvas.clip_rrect(rrect, None, true);

    // SaveLayer with backdrop - Skia captures and processes background automatically
    let layer_rec = SaveLayerRec::default().backdrop(&glass_filter);
    canvas.save_layer(&layer_rec);

    canvas.restore();
    canvas.restore();

    // Draw label at the bottom of the cell
    let text_y = cell_y + cell_height - 100.0;

    // Draw shadow for text readability
    let mut shadow_paint = Paint::default();
    shadow_paint.set_anti_alias(true);
    shadow_paint.set_color(Color::from_argb(200, 0, 0, 0));

    let mut line_offset = 0.0;
    for line in label.lines() {
        let text_width = font.measure_str(line, Some(&shadow_paint)).0;
        let text_x = cell_x + (cell_width - text_width) / 2.0;

        canvas.draw_str(
            line,
            skia_safe::Point::new(text_x + 2.0, text_y + line_offset + 2.0),
            font,
            &shadow_paint,
        );
        line_offset += 40.0;
    }

    // Draw main text
    let mut text_paint = Paint::default();
    text_paint.set_anti_alias(true);
    text_paint.set_color(Color::WHITE);

    line_offset = 0.0;
    for line in label.lines() {
        let text_width = font.measure_str(line, Some(&text_paint)).0;
        let text_x = cell_x + (cell_width - text_width) / 2.0;

        canvas.draw_str(
            line,
            skia_safe::Point::new(text_x, text_y + line_offset),
            font,
            &text_paint,
        );
        line_offset += 40.0;
    }
}

/// Draw grid lines to separate cells
fn draw_grid_lines(canvas: &skia_safe::Canvas, canvas_size: (i32, i32), cols: usize, rows: usize) {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::from_argb(100, 255, 255, 255));
    paint.set_stroke_width(2.0);
    paint.set_style(skia_safe::PaintStyle::Stroke);

    let cell_width = canvas_size.0 as f32 / cols as f32;
    let cell_height = canvas_size.1 as f32 / rows as f32;

    // Vertical lines
    for i in 1..cols {
        let x = i as f32 * cell_width;
        canvas.draw_line(
            skia_safe::Point::new(x, 0.0),
            skia_safe::Point::new(x, canvas_size.1 as f32),
            &paint,
        );
    }

    // Horizontal lines
    for i in 1..rows {
        let y = i as f32 * cell_height;
        canvas.draw_line(
            skia_safe::Point::new(0.0, y),
            skia_safe::Point::new(canvas_size.0 as f32, y),
            &paint,
        );
    }
}
