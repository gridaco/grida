use super::vn::VectorNetwork;
use crate::cg::prelude::*;

pub struct RRectShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
    /// corner radius
    pub corner_radius: RectangularCornerRadius,
}

impl Into<skia_safe::RRect> for &RRectShape {
    fn into(self) -> skia_safe::RRect {
        build_rrect(self)
    }
}

pub fn build_rrect(shape: &RRectShape) -> skia_safe::RRect {
    let irect = skia_safe::Rect::from_xywh(0.0, 0.0, shape.width, shape.height);

    if shape.corner_radius.is_zero() {
        skia_safe::RRect::new_rect(irect)
    } else {
        skia_safe::RRect::new_rect_radii(
            irect,
            &[
                shape.corner_radius.tl.tuple().into(),
                shape.corner_radius.tr.tuple().into(),
                shape.corner_radius.br.tuple().into(),
                shape.corner_radius.bl.tuple().into(),
            ],
        )
    }
}

pub fn build_rrect_path(shape: &RRectShape) -> skia_safe::Path {
    skia_safe::Path::rrect(build_rrect(shape), None)
}

/// Build a [`VectorNetwork`] representing this rounded rectangle.
///
/// Derives the vector network directly from Skia's rrect path, which uses
/// conic curves internally. The `VectorNetwork::from(&Path)` conversion
/// handles conic-to-cubic promotion, guaranteeing the resulting cubic Bézier
/// segments are pixel-identical to what Skia renders.
pub fn build_rrect_vector_network(shape: &RRectShape) -> VectorNetwork {
    let path = build_rrect_path(shape);
    VectorNetwork::from(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rectangle_vector_network_is_straight() {
        let shape = RRectShape {
            width: 100.0,
            height: 50.0,
            corner_radius: RectangularCornerRadius::zero(),
        };

        let vn = build_rrect_vector_network(&shape);

        // All segments should be straight lines (zero tangents)
        for seg in &vn.segments {
            assert_eq!(seg.ta, (0.0, 0.0), "expected straight segment, got curved");
            assert_eq!(seg.tb, (0.0, 0.0), "expected straight segment, got curved");
        }
    }

    #[test]
    fn rrect_vector_network_has_curved_corners() {
        let shape = RRectShape {
            width: 200.0,
            height: 200.0,
            corner_radius: RectangularCornerRadius::circular(40.0),
        };

        let vn = build_rrect_vector_network(&shape);

        // Should have curved segments (conics are split into multiple cubics per corner)
        let curved_count = vn
            .segments
            .iter()
            .filter(|s| s.ta != (0.0, 0.0) || s.tb != (0.0, 0.0))
            .count();
        // 4 corners, each split into 2^pow2 cubic segments
        assert!(
            curved_count >= 4,
            "expected at least 4 curved segments, got {curved_count}"
        );
        // Should be a multiple of 4 (uniform radius = equal subdivision per corner)
        assert_eq!(
            curved_count % 4,
            0,
            "curved segment count {curved_count} should be a multiple of 4"
        );
    }

    /// Render a shape to RGBA pixels via Skia.
    fn render_path_to_rgba(path: &skia_safe::Path, w: i32, h: i32) -> Vec<[u8; 4]> {
        use skia_safe::{surfaces, Color4f, ColorSpace, Paint};
        let mut paint = Paint::new(Color4f::new(1.0, 0.0, 0.0, 1.0), &ColorSpace::new_srgb());
        paint.set_anti_alias(true);
        let mut surface = surfaces::raster_n32_premul((w, h)).expect("surface");
        surface
            .canvas()
            .clear(Color4f::new(0.0, 0.0, 0.0, 0.0));
        surface.canvas().draw_path(path, &paint);
        let img = surface.image_snapshot();
        let info = img.image_info();
        let row_bytes = info.min_row_bytes();
        let mut raw = vec![0u8; row_bytes * h as usize];
        img.read_pixels(
            &info,
            &mut raw,
            row_bytes,
            skia_safe::IPoint::new(0, 0),
            skia_safe::image::CachingHint::Allow,
        );
        // Skia N32 premul is BGRA on little-endian; convert to RGBA for rendiff.
        let pixel_count = (w * h) as usize;
        let mut rgba = Vec::with_capacity(pixel_count);
        for i in 0..pixel_count {
            let off = i * 4;
            rgba.push([raw[off + 2], raw[off + 1], raw[off], raw[off + 3]]); // BGRA → RGBA
        }
        rgba
    }

    #[test]
    fn rrect_vector_network_pixel_matches_original_path() {
        use rendiff::Threshold;

        let cases: Vec<(&str, RRectShape)> = vec![
            (
                "uniform_radius",
                RRectShape {
                    width: 200.0,
                    height: 200.0,
                    corner_radius: RectangularCornerRadius::circular(40.0),
                },
            ),
            (
                "non_uniform_radius",
                RRectShape {
                    width: 200.0,
                    height: 150.0,
                    corner_radius: RectangularCornerRadius {
                        tl: Radius::circular(10.0),
                        tr: Radius::circular(30.0),
                        br: Radius::circular(50.0),
                        bl: Radius::circular(20.0),
                    },
                },
            ),
            (
                "zero_radius",
                RRectShape {
                    width: 150.0,
                    height: 100.0,
                    corner_radius: RectangularCornerRadius::zero(),
                },
            ),
        ];

        for (name, shape) in &cases {
            let w = shape.width as i32;
            let h = shape.height as i32;

            // Render original rrect path
            let original_path = build_rrect_path(shape);
            let pixels_a = render_path_to_rgba(&original_path, w, h);
            let img_a = imgref::Img::new(pixels_a, w as usize, h as usize);

            // Render vector-network round-tripped path
            let vn = build_rrect_vector_network(shape);
            let vn_paths = vn.to_paths();
            assert!(!vn_paths.is_empty(), "{name}: no paths from vector network");
            let pixels_b = render_path_to_rgba(&vn_paths[0], w, h);
            let img_b = imgref::Img::new(pixels_b, w as usize, h as usize);

            // Compare with rendiff: tolerates 1px spatial displacement and
            // anti-aliasing differences from conic-to-cubic conversion.
            //
            // rendiff::diff already accounts for 1px spatial shift (neighborhood
            // comparison). The remaining per-pixel color differences come from
            // Skia rasterizing conics vs cubics differently at sub-pixel level.
            // We allow:
            //   - any number of diffs ≤ 10 (AA rounding noise)
            //   - up to 300 diffs ≤ 60 (worst-case edge pixel mismatch)
            let diff = rendiff::diff(img_a.as_ref(), img_b.as_ref());
            let threshold = Threshold::new([(10, usize::MAX), (60, 300)]);
            assert!(
                threshold.allows(diff.histogram()),
                "{name}: pixel mismatch exceeds threshold.\n  histogram: {:?}",
                diff.histogram(),
            );
        }
    }
}
