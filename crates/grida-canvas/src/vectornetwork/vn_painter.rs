use crate::cg::types::*;
use crate::cg::varwidth::*;
use crate::painter::cvt;
use crate::shape::stroke::stroke_geometry;
use crate::shape::stroke_varwidth::create_variable_width_stroke_from_geometry;
use skia_safe::{Canvas, PaintStyle};

use super::vn::{PiecewiseVectorNetworkGeometry, VectorNetwork};

#[derive(Debug, Clone)]
pub struct StrokeOptions {
    pub width: f32,
    pub align: StrokeAlign,
    pub color: CGColor,
    pub width_profile: Option<VarWidthProfile>,
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
            if let Some(var_width_profile) = &stroke_opts.width_profile {
                // Handle variable width stroke
                let geometry = PiecewiseVectorNetworkGeometry {
                    vertices: vn.vertices.clone(),
                    segments: vn.segments.clone(),
                };
                let stroke_path = create_variable_width_stroke_from_geometry(
                    geometry,
                    var_width_profile.clone(),
                    40, // Default samples per segment
                );
                let bounds = stroke_path.compute_tight_bounds();
                let size = (bounds.width(), bounds.height());
                let paint = Paint::Solid(SolidPaint {
                    color: stroke_opts.color,
                    opacity: 1.0,
                });
                let mut sk_paint = cvt::sk_paint(&paint, 1.0, size);
                sk_paint.set_style(PaintStyle::Fill);
                self.canvas.draw_path(&stroke_path, &sk_paint);
            } else {
                // Handle regular stroke
                let merged = vn.to_union_path();
                let stroke_path =
                    stroke_geometry(&merged, stroke_opts.width, stroke_opts.align, None);
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
}
