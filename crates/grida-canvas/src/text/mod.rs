pub mod attributed_paragraph;
pub mod paragraph_cache_layout;
pub mod text_style;
pub mod text_transform;

use crate::cg::types::TextAlign;
use crate::vectornetwork::VectorNetwork;
use skia_safe::textlayout;
use skia_safe::{textlayout::Paragraph, Matrix, Path, PathBuilder, Point};

/// Create a [`ParagraphStyle`] with standard settings.
///
/// Shared by measurement (`ParagraphCache`), rendering (`attributed_paragraph`),
/// and the text editing layout adapter. Centralises text-direction, alignment,
/// rounding-hack suppression, and max-lines/ellipsis.
pub fn make_paragraph_style(
    align: TextAlign,
    max_lines: Option<usize>,
    ellipsis: Option<&str>,
) -> textlayout::ParagraphStyle {
    let mut ps = textlayout::ParagraphStyle::new();
    ps.set_text_direction(textlayout::TextDirection::LTR);
    ps.set_text_align(align.into());
    ps.set_apply_rounding_hack(false);
    if let Some(max_lines) = max_lines.filter(|&m| m > 0) {
        ps.set_max_lines(max_lines);
        ps.set_ellipsis(ellipsis.unwrap_or("..."));
    }
    ps
}

/// Convert a Skia [`Paragraph`] into a [`Path`].
pub fn paragraph_to_path(paragraph: &mut Paragraph) -> Path {
    let mut builder = PathBuilder::new();
    paragraph.visit(|_, run| {
        if let Some(run) = run {
            let font = run.font();
            let glyphs = run.glyphs();
            let positions = run.positions();
            let origin = run.origin();
            for (glyph, pos) in glyphs.iter().zip(positions.iter()) {
                if let Some(glyph_path) = font.get_path(*glyph) {
                    let offset = Point::new(pos.x + origin.x, pos.y + origin.y);
                    if offset.x != 0.0 || offset.y != 0.0 {
                        let transformed =
                            glyph_path.make_transform(&Matrix::translate((offset.x, offset.y)));
                        builder.add_path(&transformed);
                    } else {
                        builder.add_path(&glyph_path);
                    }
                }
            }
        }
    });
    builder.detach()
}

/// Convert a Skia [`Paragraph`] into a [`VectorNetwork`].
pub fn paragraph_to_vector_network(paragraph: &mut Paragraph) -> VectorNetwork {
    let path = paragraph_to_path(paragraph);
    VectorNetwork::from(&path)
}
