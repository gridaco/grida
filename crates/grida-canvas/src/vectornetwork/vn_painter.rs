use crate::cg::types::*;
use crate::painter::cvt;
use crate::shape::stroke::stroke_geometry;
use skia_safe::{Canvas, PaintStyle};

use super::vn::VectorNetwork;

#[derive(Debug, Clone, Copy)]
pub struct StrokeOptions {
    pub width: f32,
    pub align: StrokeAlign,
    pub color: CGColor,
}

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
    pub fn draw(&self, vn: &VectorNetwork, stroke: Option<&StrokeOptions>) {
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

        if let Some(stroke_opts) = stroke {
            let merged = vn.to_union_path();
            let stroke_path = stroke_geometry(&merged, stroke_opts.width, stroke_opts.align, None);
            let bounds = stroke_path.compute_tight_bounds();
            let size = (bounds.width(), bounds.height());
            let paint = Paint::Solid(SolidPaint {
                color: stroke_opts.color,
                opacity: 1.0,
            });
            let mut sk_paint = cvt::sk_paint(&paint, 1.0, size);
            sk_paint.set_style(PaintStyle::Fill);
            self.canvas.draw_path(&stroke_path, &sk_paint);
        }
    }
}
