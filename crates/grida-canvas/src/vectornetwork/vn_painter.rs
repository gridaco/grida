use crate::cg::types::*;
use crate::painter::cvt;
use skia_safe::{Canvas, PaintStyle};

use super::vn::VectorNetwork;

/// Painter for [`VectorNetwork`]s that renders region-specific fills.
///
/// This is a specialized renderer focused on accurate region-based
/// rendering and is currently intended for development and demo use.
pub struct VNPainter<'a> {
    canvas: &'a Canvas,
}

impl<'a> VNPainter<'a> {
    /// Create a new painter targeting the provided canvas.
    pub fn new(canvas: &'a Canvas) -> Self {
        Self { canvas }
    }

    /// Draw the provided vector network onto the canvas.
    pub fn draw(&self, vn: &VectorNetwork) {
        let paths = vn.to_paths();
        for (region, path) in vn.regions.iter().zip(paths.iter()) {
            let Some(fills) = &region.fills else { continue };
            let bounds = path.compute_tight_bounds();
            let size = (bounds.width(), bounds.height());
            for fill in fills {
                let mut sk_paint = cvt::sk_paint(fill, 1.0, size);
                sk_paint.set_style(PaintStyle::Fill);
                if let Some(shader) = sk_paint.shader() {
                    let matrix = skia_safe::Matrix::translate((-bounds.left, -bounds.top));
                    sk_paint.set_shader(shader.with_local_matrix(&matrix));
                }
                self.canvas.draw_path(path, &sk_paint);
            }
        }
    }
}
