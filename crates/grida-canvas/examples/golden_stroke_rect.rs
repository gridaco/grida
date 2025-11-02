/// Demonstration of rectangular stroke with corner radius and per-side widths.
///
/// This example demonstrates the algorithm described in docs/wg/feat-painting/stroke-rect.md:
/// - Per-side stroke widths with varied corner radii
/// - All three stroke alignments (Inside/Center/Outside)
/// - Dashed stroke patterns that respect corners
/// - Gradient paint for strokes
use cg::cg::prelude::*;
use cg::painter::paint::shader_from_paint;
use cg::shape::stroke_rect::stroke_geometry_rectangular;
use skia_safe::{surfaces, Canvas, Color, EncodedImageFormat, Paint, PaintStyle, Rect};

fn main() {
    // Canvas setup - larger to fit all 3 alignment demos
    let width = 1400;
    let height = 600;
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");

    // Clear background
    surface.canvas().clear(Color::WHITE);

    // Draw stroke alignment comparison demos
    draw_stroke_alignment_demos(surface.canvas());

    // Save output
    let image = surface.image_snapshot();
    let data = image.encode(None, EncodedImageFormat::PNG, None).unwrap();
    std::fs::write(
        "crates/grida-canvas/goldens/stroke_rect.png",
        data.as_bytes(),
    )
    .unwrap();
    println!("Saved crates/grida-canvas/goldens/stroke_rect.png");
}

/// Draws three rectangles demonstrating Inside/Center/Outside stroke alignments.
fn draw_stroke_alignment_demos(canvas: &Canvas) {
    // Shared configuration for all three demos
    let config = DemoConfig::new();

    // Draw three rectangles side by side with different alignments
    let demos = [
        (StrokeAlign::Inside, 80.0),
        (StrokeAlign::Center, 520.0),
        (StrokeAlign::Outside, 960.0),
    ];

    for (align, x_offset) in demos {
        canvas.save();
        canvas.translate((x_offset, 150.0));

        // Draw the fill first (so stroke appears on top)
        draw_fill(canvas, &config, align);

        // Draw the rectangular stroke on top
        draw_rectangular_stroke(canvas, &config, align);

        canvas.restore();
    }
}

/// Configuration for the rectangular stroke demo
struct DemoConfig {
    rect: Rect,
    widths: RectangularStrokeWidth,
    radii: RectangularCornerRadius,
    stroke_paint: cg::cg::Paint,
    dash: Option<(Vec<f32>, f32)>,
}

impl DemoConfig {
    fn new() -> Self {
        Self {
            rect: Rect::from_xywh(0.0, 0.0, 350.0, 280.0),

            widths: RectangularStrokeWidth {
                stroke_top_width: 5.0,
                stroke_right_width: 0.0, // No stroke on right side!
                stroke_bottom_width: 20.0,
                stroke_left_width: 25.0,
            },

            radii: RectangularCornerRadius {
                tl: Radius { rx: 60.0, ry: 40.0 }, // Wide, short oval
                tr: Radius { rx: 30.0, ry: 30.0 }, // Small circle
                br: Radius { rx: 50.0, ry: 80.0 }, // Tall, narrow oval
                bl: Radius { rx: 80.0, ry: 50.0 }, // Wide, medium oval
            },

            stroke_paint: cg::cg::Paint::LinearGradient(LinearGradientPaint {
                active: true,
                blend_mode: BlendMode::Normal,
                opacity: 1.0,
                transform: math2::transform::AffineTransform::identity(),
                stops: vec![
                    GradientStop {
                        offset: 0.0,
                        color: CGColor(50, 100, 200, 255), // Blue
                    },
                    GradientStop {
                        offset: 1.0,
                        color: CGColor(150, 50, 200, 255), // Purple
                    },
                ],
            }),

            dash: Some((vec![12.0, 8.0], 0.0)),
        }
    }
}

/// Renders a rectangular stroke using the library's stroke_geometry_rectangular function.
fn draw_rectangular_stroke(canvas: &Canvas, config: &DemoConfig, align: StrokeAlign) {
    // Convert dash to StrokeDashArray if present
    let dash_array = config
        .dash
        .as_ref()
        .map(|(intervals, _phase)| StrokeDashArray::from(intervals.clone()));

    // Get stroke geometry from library
    let stroke_path = stroke_geometry_rectangular(
        config.rect,
        &config.widths,
        &config.radii,
        align,
        StrokeMiterLimit::default(),
        dash_array.as_ref(),
    );

    // Get shader from paint
    let size = (config.rect.width(), config.rect.height());
    if let Some(shader) = shader_from_paint(&config.stroke_paint, size, None) {
        let mut skia_paint = Paint::default();
        skia_paint.set_anti_alias(true);
        skia_paint.set_style(PaintStyle::Fill);
        skia_paint.set_shader(shader);
        canvas.draw_path(&stroke_path, &skia_paint);
    }
}

/// Helper: Draw the fill area based on alignment
fn draw_fill(canvas: &Canvas, config: &DemoConfig, align: StrokeAlign) {
    let (fill_rect, fill_radii) = match align {
        StrokeAlign::Inside => {
            // Inside: fill is inset by stroke widths
            let rect = Rect::from_ltrb(
                config.rect.left + config.widths.stroke_left_width,
                config.rect.top + config.widths.stroke_top_width,
                config.rect.right - config.widths.stroke_right_width,
                config.rect.bottom - config.widths.stroke_bottom_width,
            );
            let radii = RectangularCornerRadius {
                tl: Radius {
                    rx: (config.radii.tl.rx - config.widths.stroke_left_width).max(0.0),
                    ry: (config.radii.tl.ry - config.widths.stroke_top_width).max(0.0),
                },
                tr: Radius {
                    rx: (config.radii.tr.rx - config.widths.stroke_right_width).max(0.0),
                    ry: (config.radii.tr.ry - config.widths.stroke_top_width).max(0.0),
                },
                br: Radius {
                    rx: (config.radii.br.rx - config.widths.stroke_right_width).max(0.0),
                    ry: (config.radii.br.ry - config.widths.stroke_bottom_width).max(0.0),
                },
                bl: Radius {
                    rx: (config.radii.bl.rx - config.widths.stroke_left_width).max(0.0),
                    ry: (config.radii.bl.ry - config.widths.stroke_bottom_width).max(0.0),
                },
            };
            (rect, radii)
        }
        StrokeAlign::Center | StrokeAlign::Outside => (config.rect, config.radii),
    };

    let rr_fill = skia_safe::RRect::new_rect_radii(
        fill_rect,
        &[
            skia_safe::Vector::new(fill_radii.tl.rx, fill_radii.tl.ry),
            skia_safe::Vector::new(fill_radii.tr.rx, fill_radii.tr.ry),
            skia_safe::Vector::new(fill_radii.br.rx, fill_radii.br.ry),
            skia_safe::Vector::new(fill_radii.bl.rx, fill_radii.bl.ry),
        ],
    );

    let fill_paint = cg::cg::Paint::Solid(SolidPaint {
        active: true,
        color: CGColor(240, 240, 240, 255),
        blend_mode: BlendMode::Normal,
    });

    let size = (fill_rect.width(), fill_rect.height());
    if let Some(shader) = shader_from_paint(&fill_paint, size, None) {
        let mut skia_paint = Paint::default();
        skia_paint.set_anti_alias(true);
        skia_paint.set_style(PaintStyle::Fill);
        skia_paint.set_shader(shader);
        canvas.draw_rrect(rr_fill, &skia_paint);
    }
}
