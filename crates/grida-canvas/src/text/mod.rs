pub mod text_style;
pub mod text_transform;

use crate::vectornetwork::VectorNetwork;
use skia_safe::{path::AddPathMode, textlayout::Paragraph, Path, Point};

/// Convert a Skia [`Paragraph`] into a [`Path`].
pub fn paragraph_to_path(paragraph: &mut Paragraph) -> Path {
    let mut path = Path::new();
    paragraph.visit(|_, run| {
        if let Some(run) = run {
            let font = run.font();
            let glyphs = run.glyphs();
            let positions = run.positions();
            let origin = run.origin();
            for (glyph, pos) in glyphs.iter().zip(positions.iter()) {
                if let Some(glyph_path) = font.get_path(*glyph) {
                    let offset = Point::new(pos.x + origin.x, pos.y + origin.y);
                    path.add_path(&glyph_path, offset, AddPathMode::Append);
                }
            }
        }
    });
    path
}

/// Convert a Skia [`Paragraph`] into a [`VectorNetwork`].
pub fn paragraph_to_vector_network(paragraph: &mut Paragraph) -> VectorNetwork {
    let path = paragraph_to_path(paragraph);
    VectorNetwork::from(&path)
}
