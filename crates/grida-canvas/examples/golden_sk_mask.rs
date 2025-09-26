use cg::cg::types::*;
use skia_safe::{
    luma_color_filter, surfaces, BlendMode, Color, Paint, Path, Point, Rect, Shader, TileMode,
};

fn draw_demo_content(canvas: &skia_safe::Canvas, area: Rect) {
    // Draw colorful content to visualize masking results
    let mut paint = Paint::default();
    paint.set_anti_alias(true);

    // Background
    paint.set_color(Color::from_argb(255, 240, 240, 240));
    canvas.draw_rect(area, &paint);

    // Overlapping rectangles
    paint.set_color(Color::from_argb(255, 255, 99, 71));
    canvas.draw_rect(
        Rect::from_xywh(
            area.left() + 10.0,
            area.top() + 10.0,
            area.width() * 0.6,
            area.height() * 0.6,
        ),
        &paint,
    );

    paint.set_color(Color::from_argb(255, 65, 105, 225));
    canvas.draw_rect(
        Rect::from_xywh(
            area.left() + area.width() * 0.3,
            area.top() + area.height() * 0.3,
            area.width() * 0.6,
            area.height() * 0.6,
        ),
        &paint,
    );

    // Diagonal band
    paint.set_color(Color::from_argb(180, 60, 179, 113));
    let mut band = Path::new();
    band.move_to(Point::new(area.left(), area.top() + area.height() * 0.25));
    band.line_to(Point::new(area.right(), area.top() + area.height() * 0.05));
    band.line_to(Point::new(area.right(), area.top() + area.height() * 0.35));
    band.line_to(Point::new(area.left(), area.top() + area.height() * 0.55));
    band.close();
    canvas.draw_path(&band, &paint);
}

fn draw_geometry_mask(canvas: &skia_safe::Canvas, area: Rect) {
    // Clip to a circular geometry path and draw content inside
    canvas.save();
    let mut clip_path = Path::new();
    clip_path.add_circle(
        Point::new(area.center_x(), area.center_y()),
        (area.width().min(area.height())) * 0.4,
        None,
    );
    canvas.clip_path(&clip_path, None, true);
    draw_demo_content(canvas, area);
    canvas.restore();

    // Outline the geometry for visibility
    let mut outline = Paint::default();
    outline.set_anti_alias(true);
    outline.set_style(skia_safe::paint::Style::Stroke);
    outline.set_stroke_width(2.0);
    outline.set_color(Color::from_argb(255, 0, 0, 0));
    let mut outline_path = Path::new();
    outline_path.add_circle(
        Point::new(area.center_x(), area.center_y()),
        (area.width().min(area.height())) * 0.4,
        None,
    );
    canvas.draw_path(&outline_path, &outline);
}

fn draw_alpha_mask(canvas: &skia_safe::Canvas, area: Rect) {
    // Save to an isolated layer so we can apply an alpha mask using DstIn
    canvas.save_layer(&Default::default());

    // Draw content
    draw_demo_content(canvas, area);

    // Create radial alpha gradient mask (center opaque -> edges transparent)
    let center = Point::new(area.center_x(), area.center_y());
    let radius = (area.width().min(area.height())) * 0.45;
    let colors = [
        Color::from_argb(255, 128, 128, 128), // opaque grey at center
        Color::from_argb(0, 128, 128, 128),   // transparent grey at edge
    ];
    let positions = [0.0_f32, 1.0_f32];
    let shader = Shader::radial_gradient(
        center,
        radius,
        &colors[..],
        Some(&positions[..]),
        TileMode::Clamp,
        None,
        None,
    )
    .unwrap();

    // Apply mask via DstIn blending
    let mut mask_paint = Paint::default();
    mask_paint.set_anti_alias(true);
    mask_paint.set_shader(shader);
    mask_paint.set_blend_mode(BlendMode::DstIn);
    canvas.draw_rect(area, &mask_paint);

    canvas.restore();
}

fn draw_luminance_mask(canvas: &skia_safe::Canvas, area: Rect) {
    // Save to an isolated layer to apply luminance->alpha masking
    canvas.save_layer(&Default::default());

    // Draw content
    draw_demo_content(canvas, area);

    // Create a radial gradient in RGB (alpha=255), then convert luminance to alpha with a color matrix
    let center = Point::new(area.center_x(), area.center_y());
    let radius = (area.width().min(area.height())) * 0.45;
    let colors = [
        Color::from_argb(255, 220, 220, 220), // bright grey center
        Color::from_argb(255, 40, 40, 40),    // dark grey edge
    ];
    let positions = [0.0_f32, 1.0_f32];
    let shader = Shader::radial_gradient(
        center,
        radius,
        &colors[..],
        Some(&positions[..]),
        TileMode::Clamp,
        None,
        None,
    )
    .unwrap();

    // Built-in luma color filter to convert luminance to alpha
    let cf = luma_color_filter::new();

    // Draw mask rectangle: shader provides RGB, color filter moves luminance into alpha, DstIn applies mask
    let mut mask_paint = Paint::default();
    mask_paint.set_anti_alias(true);
    mask_paint.set_shader(shader);
    mask_paint.set_color_filter(cf);
    mask_paint.set_blend_mode(BlendMode::DstIn);
    canvas.draw_rect(area, &mask_paint);

    canvas.restore();
}

fn draw_panel(
    canvas: &skia_safe::Canvas,
    origin: Point,
    size: (f32, f32),
    kind: Option<LayerMaskType>,
) {
    let area = Rect::from_xywh(origin.x, origin.y, size.0, size.1);
    match kind {
        Some(LayerMaskType::Geometry) => {
            draw_geometry_mask(canvas, area);
        }
        Some(LayerMaskType::Image(ImageMaskType::Alpha)) => {
            draw_alpha_mask(canvas, area);
        }
        Some(LayerMaskType::Image(ImageMaskType::Luminance)) => {
            draw_luminance_mask(canvas, area);
        }
        None => {
            draw_demo_content(canvas, area);
        }
    }

    // Panel border
    let mut border = Paint::default();
    border.set_style(skia_safe::paint::Style::Stroke);
    border.set_stroke_width(1.0);
    border.set_color(Color::from_argb(255, 200, 200, 200));
    canvas.draw_rect(area, &border);
}

fn main() {
    // Create a surface
    let width = 1400;
    let height = 400;
    let mut surface = surfaces::raster_n32_premul((width, height)).unwrap();
    let canvas = surface.canvas();

    // Clear background
    canvas.clear(Color::WHITE);

    // Layout four panels side-by-side
    let panel_w = (width as f32 - 5.0 * 20.0) / 4.0; // margins between panels
    let panel_h = height as f32 - 40.0;
    let top = 20.0;
    let mut left = 20.0;

    let kinds: Vec<Option<LayerMaskType>> = vec![
        None,
        Some(LayerMaskType::Geometry),
        Some(LayerMaskType::Image(ImageMaskType::Alpha)),
        Some(LayerMaskType::Image(ImageMaskType::Luminance)),
    ];

    for kind in kinds.iter() {
        draw_panel(canvas, Point::new(left, top), (panel_w, panel_h), *kind);
        left += panel_w + 20.0;
    }

    // Save PNG to goldens
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let bytes = data.as_bytes();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/sk_mask.png"),
        bytes,
    )
    .unwrap();
    println!("Generated sk_mask.png");
}
