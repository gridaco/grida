use crate::cg::types::{Paint, StrokeAlign};
use crate::painter::paint;
use crate::runtime::image_repository::ImageRepository;
use crate::shape::stroke::stroke_geometry;
use skia_safe::{self, path::AddPathMode, Canvas, Font, GlyphId, Matrix, PaintStyle, Path, Point};

/// Draw stroked text with custom stroke alignment using `SkTextBlob`.
///
/// This constructs a `TextBlob` from the provided glyphs and positions,
/// converts it to a `Path`, computes stroke geometry with the desired
/// alignment, and finally paints it using the given `stroke_paint`.
pub fn draw_text_stroke(
    canvas: &Canvas,
    glyphs: &[GlyphId],
    positions: &[Point],
    origin: Point,
    font: &Font,
    strokes: &[Paint],
    stroke_width: f32,
    stroke_align: StrokeAlign,
    images: &ImageRepository,
) {
    if glyphs.is_empty() || strokes.is_empty() {
        return;
    }

    // Build a path from individual glyphs and their positions.
    let mut path = Path::new();
    for (glyph, position) in glyphs.iter().zip(positions.iter()) {
        if let Some(glyph_path) = font.get_path(*glyph) {
            let offset = Point::new(position.x + origin.x, position.y + origin.y);
            path.add_path(&glyph_path, offset, AddPathMode::Append);
        }
    }
    if path.is_empty() {
        return;
    }

    // Compute stroke geometry using the vector network's stroke_align model.
    let stroke_path = stroke_geometry(&path, stroke_width, stroke_align, None);
    if stroke_path.is_empty() {
        return;
    }

    // Prepare paint for filling the stroke geometry.
    let bounds = stroke_path.compute_tight_bounds();
    let size = (bounds.width(), bounds.height());
    let Some(mut sk_paint) = paint::sk_paint_stack(strokes, size, images) else {
        return;
    };
    sk_paint.set_style(PaintStyle::Fill);

    // Translate shader to match path bounds if needed.
    if let Some(shader) = sk_paint.shader() {
        let matrix = Matrix::translate((-bounds.left, -bounds.top));
        sk_paint.set_shader(shader.with_local_matrix(&matrix));
    }

    // Draw the stroked text path.
    canvas.draw_path(&stroke_path, &sk_paint);
}

/// Fast path for outside-aligned text stroke.
///
/// This simply strokes the glyph run and expects the paragraph fill to be drawn
/// **after** this call so the inner half of the stroke gets covered. By drawing
/// the stroke first we avoid path conversion and boolean operations for a
/// performance win.
///
/// Because this relies on painting order it is not suitable for vector
/// exporting or baking to outlines; those use cases require a separate pipeline
/// that computes proper stroke geometry.
///
/// ## ⚠️ Note
///
/// This method draws the stroke *before* the fill. When the fill is
/// transparent or omitted, the stroke will take over the visuals. We have not
/// yet established a policy on whether this behaviour is desirable, so this
/// function may be dropped or limited to very specific scenarios in the
/// future.
pub fn draw_text_stroke_outside_fast_pre(
    canvas: &Canvas,
    glyphs: &[GlyphId],
    positions: &[Point],
    origin: Point,
    font: &Font,
    strokes: &[Paint],
    stroke_width: f32,
    layout_size: (f32, f32),
    images: &ImageRepository,
) {
    if glyphs.is_empty() || strokes.is_empty() {
        return;
    }

    // Build a TextBlob from glyphs and their positions (offset by origin).
    let mut builder = skia_safe::TextBlobBuilder::new();
    let (glyph_buffer, pos_buffer) = builder.alloc_run_pos(font, glyphs.len(), None);
    glyph_buffer.copy_from_slice(glyphs);
    for (dst, src) in pos_buffer.iter_mut().zip(positions.iter()) {
        *dst = Point::new(src.x + origin.x, src.y + origin.y);
    }
    let blob = match builder.make() {
        Some(blob) => blob,
        None => return,
    };

    // Prepare a stroke paint. We double the stroke width so that when the
    // paragraph is painted afterwards, it covers the inner half leaving only
    // the "outside" portion visible.
    let Some(mut sk_paint) = paint::sk_paint_stack(strokes, layout_size, images) else {
        return;
    };
    sk_paint.set_style(PaintStyle::Stroke);
    sk_paint.set_stroke_width(stroke_width * 2.0);

    // Draw the stroked glyphs.
    canvas.draw_text_blob(blob, (0.0, 0.0), &sk_paint);
}
