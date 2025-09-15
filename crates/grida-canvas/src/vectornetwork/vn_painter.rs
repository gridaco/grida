use crate::cg::types::*;
use crate::cg::varwidth::*;
use crate::painter::cvt;
use crate::runtime::image_repository::ImageRepository;
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
    images: Option<&'a ImageRepository>,
}

impl<'a> VNPainter<'a> {
    /// Create a new painter targeting the provided canvas.
    pub fn new(canvas: &'a Canvas) -> Self {
        Self {
            canvas,
            images: None,
        }
    }

    /// Create a new painter with an image repository for image paints.
    pub fn new_with_images(canvas: &'a Canvas, images: &'a ImageRepository) -> Self {
        Self {
            canvas,
            images: Some(images),
        }
    }

    /// Draw the provided vector network onto the canvas.
    ///
    /// Fills defined on individual regions take precedence. When a region
    /// does not provide its own fills, the `node_fills` slice is used as a
    /// fallback, matching the behavior of vector nodes that have a single
    /// node-level fill.
    pub fn draw(
        &self,
        vn: &VectorNetwork,
        fills_fallback: &[Paint],
        stroke: Option<&StrokeOptions>,
    ) {
        let paths = vn.to_paths();
        if vn.regions.is_empty() {
            // When no regions are defined, apply the node-level fills to the
            // entire vector network path.
            for path in paths.iter() {
                self.draw_path_fills(path, fills_fallback);
            }
        } else {
            for (region, path) in vn.regions.iter().zip(paths.iter()) {
                let fills = region
                    .fills
                    .as_ref()
                    .map(|v| v.as_slice())
                    .unwrap_or(fills_fallback);
                self.draw_path_fills(path, fills);
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
            blend_mode: BlendMode::default(),
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
            blend_mode: BlendMode::default(),
        });

        // Convert to Skia paint and draw
        let mut sk_paint = cvt::sk_paint(&paint, 1.0, size);
        sk_paint.set_style(PaintStyle::Fill);
        self.canvas.draw_path(&stroke_path, &sk_paint);
    }

    /// Helper method to draw fills on a path.
    fn draw_path_fills(&self, path: &skia_safe::Path, fills: &[Paint]) {
        if fills.is_empty() {
            return;
        }
        let bounds = path.compute_tight_bounds();
        let size = (bounds.width(), bounds.height());

        if let Some(images) = self.images {
            if let Some(mut paint) = cvt::sk_paint_stack(fills, 1.0, size, images) {
                paint.set_style(PaintStyle::Fill);
                if let Some(shader) = paint.shader() {
                    let matrix = skia_safe::Matrix::translate((-bounds.left, -bounds.top));
                    paint.set_shader(shader.with_local_matrix(&matrix));
                }
                self.canvas.draw_path(path, &paint);
            }
        } else {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cg::types::{
        BlendMode, CGColor, FillRule, ImagePaint, Paint, ResourceRef, SolidPaint,
    };
    use crate::resources::ByteStore;
    use crate::runtime::image_repository::ImageRepository;
    use crate::vectornetwork::{VectorNetworkLoop, VectorNetworkRegion, VectorNetworkSegment};
    use math2::{box_fit::BoxFit, transform::AffineTransform};
    use skia_safe::{surfaces, Color, EncodedImageFormat};
    use std::sync::{Arc, Mutex};

    #[test]
    fn fills_fallback_when_no_regions() {
        // Simple rectangle vector network without region definitions
        let vn = VectorNetwork {
            vertices: vec![(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)],
            segments: vec![
                VectorNetworkSegment::ab(0, 1),
                VectorNetworkSegment::ab(1, 2),
                VectorNetworkSegment::ab(2, 3),
                VectorNetworkSegment::ab(3, 0),
            ],
            regions: vec![],
        };

        let mut surface = surfaces::raster_n32_premul((20, 20)).expect("surface");
        let canvas = surface.canvas();
        canvas.clear(Color::from_argb(0, 0, 0, 0));

        let painter = VNPainter::new(canvas);
        let fills = vec![Paint::Solid(SolidPaint {
            color: CGColor::RED,
            opacity: 1.0,
            blend_mode: BlendMode::default(),
        })];
        painter.draw(&vn, &fills, None);

        let snapshot = surface.image_snapshot();
        let pixmap = snapshot.peek_pixels().expect("pixmap");
        let color = pixmap.get_color((5, 5));
        assert_eq!(color, Color::from_argb(255, 255, 0, 0));
    }

    #[test]
    fn image_fill_renders() {
        // Prepare image repository with a simple green image
        let mut store = ByteStore::new();
        let mut img_surface = surfaces::raster_n32_premul((2, 2)).expect("surface");
        img_surface.canvas().clear(Color::GREEN);
        let img = img_surface.image_snapshot();
        let data = img.encode(None, EncodedImageFormat::PNG, None).unwrap();
        let hash = 1u64;
        store.insert(hash, data.as_bytes().to_vec());
        let store = Arc::new(Mutex::new(store));
        let mut repo = ImageRepository::new(store);
        repo.insert("img".to_string(), hash);

        // Vector network with single rectangular region using image fill
        let vn = VectorNetwork {
            vertices: vec![(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)],
            segments: vec![
                VectorNetworkSegment::ab(0, 1),
                VectorNetworkSegment::ab(1, 2),
                VectorNetworkSegment::ab(2, 3),
                VectorNetworkSegment::ab(3, 0),
            ],
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
                fill_rule: FillRule::NonZero,
                fills: Some(vec![Paint::Image(ImagePaint {
                    transform: AffineTransform::identity(),
                    image: ResourceRef::RID("img".to_string()),
                    fit: BoxFit::Fill,
                    opacity: 1.0,
                    blend_mode: BlendMode::default(),
                })]),
            }],
        };

        let mut surface = surfaces::raster_n32_premul((10, 10)).expect("surface");
        let canvas = surface.canvas();
        canvas.clear(Color::WHITE);

        let painter = VNPainter::new_with_images(canvas, &repo);
        painter.draw(&vn, &[], None);

        let snapshot = surface.image_snapshot();
        let pixmap = snapshot.peek_pixels().expect("pixmap");
        let color = pixmap.get_color((5, 5));
        assert_eq!(color, Color::GREEN);
    }
}
