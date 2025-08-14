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
                // Handle variable width stroke using the dedicated method
                // Use PiecewiseVectorNetworkGeometry::new for validation
                match PiecewiseVectorNetworkGeometry::new(vn.vertices.clone(), vn.segments.clone())
                {
                    Ok(geometry) => {
                        self.draw_stroke_variable_width(
                            &geometry,
                            stroke_opts.color,
                            var_width_profile,
                        );
                    }
                    Err(_) => {
                        // Fall back to regular stroke if geometry is not valid
                        self.draw_stroke_regular(vn, stroke_opts);
                    }
                }
            } else {
                // Handle regular stroke with vector network-specific alignment logic
                self.draw_stroke_regular(vn, stroke_opts);
            }
        }
    }

    /// Draw a regular stroke with vector network-specific alignment behavior.
    ///
    /// For vector networks, the stroke alignment affects both the stroke geometry
    /// and the base path used for rendering:
    /// - `Outside`: Uses the unioned path as the base
    /// - `Center` and `Inside`: Uses individual paths as the base
    fn draw_stroke_regular(&self, vn: &VectorNetwork, stroke_opts: &StrokeOptions) {
        use StrokeAlign::*;

        match stroke_opts.align {
            Outside => {
                // For outside alignment, use the unioned path as the base
                let merged = vn.to_union_path();
                let stroke_path =
                    stroke_geometry(&merged, stroke_opts.width, stroke_opts.align, None);
                self.draw_stroke_path(&stroke_path, stroke_opts.color);
            }
            Center | Inside => {
                // For center and inside alignments, stroke each individual path
                let paths = vn.to_paths();
                for path in paths {
                    let stroke_path =
                        stroke_geometry(&path, stroke_opts.width, stroke_opts.align, None);
                    self.draw_stroke_path(&stroke_path, stroke_opts.color);
                }
            }
        }
    }

    /// Helper method to draw a stroke path with the given color.
    fn draw_stroke_path(&self, stroke_path: &skia_safe::Path, color: CGColor) {
        let bounds = stroke_path.compute_tight_bounds();
        let size = (bounds.width(), bounds.height());
        let paint = Paint::Solid(SolidPaint {
            color,
            opacity: 1.0,
        });
        let mut sk_paint = cvt::sk_paint(&paint, 1.0, size);
        sk_paint.set_style(PaintStyle::Fill);
        self.canvas.draw_path(stroke_path, &sk_paint);
    }

    /// Draw a variable width stroke along a piecewise vector network geometry.
    ///
    /// This method creates and renders a variable width stroke along the provided geometry
    /// using the specified color and width profile.
    ///
    /// # Arguments
    ///
    /// * `geometry` - The piecewise vector network geometry to stroke along
    /// * `stroke_color` - The color of the stroke
    /// * `stroke_profile` - The variable width profile defining how the stroke width varies
    pub fn draw_stroke_variable_width(
        &self,
        geometry: &PiecewiseVectorNetworkGeometry,
        stroke_color: CGColor,
        stroke_profile: &VarWidthProfile,
    ) {
        // Create the variable width stroke path
        let stroke_path = create_variable_width_stroke_from_geometry(
            geometry.clone(),
            stroke_profile.clone(),
            40, // Default samples per segment
        );

        // Calculate bounds for the stroke path
        let bounds = stroke_path.compute_tight_bounds();
        let size = (bounds.width(), bounds.height());

        // Create paint for the stroke
        let paint = Paint::Solid(SolidPaint {
            color: stroke_color,
            opacity: 1.0,
        });

        // Convert to Skia paint and draw
        let mut sk_paint = cvt::sk_paint(&paint, 1.0, size);
        sk_paint.set_style(PaintStyle::Fill);
        self.canvas.draw_path(&stroke_path, &sk_paint);
    }
}
