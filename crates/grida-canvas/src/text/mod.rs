pub mod text_style;
pub mod text_transform;

use crate::vectornetwork::VectorNetwork;
use skia_safe::{textlayout::Paragraph, Matrix, Path, PathBuilder, Point};

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
