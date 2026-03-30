use super::*;
use cg::cg::alignment::Alignment;
use math2::box_fit::BoxFit;
use math2::transform::AffineTransform;

pub fn build() -> Scene {
    let s = 150.0;
    let gap = 170.0;
    let img = || ResourceRef::HASH(SYSTEM_IMAGE.to_owned());

    // Cover fit
    let r1 = rect(
        0.0,
        0.0,
        s,
        s,
        image_paint_with(img(), ImagePaintFit::Fit(BoxFit::Cover)),
    );

    // Contain fit
    let r2 = rect(
        gap,
        0.0,
        s,
        s,
        image_paint_with(img(), ImagePaintFit::Fit(BoxFit::Contain)),
    );

    // Transform fit (zoom 1.5× centered with slight offset)
    let r3 = rect(
        gap * 2.0,
        0.0,
        s,
        s,
        image_paint_with(
            img(),
            ImagePaintFit::Transform(AffineTransform {
                matrix: [[1.5, 0.0, -0.25], [0.0, 1.5, -0.15]],
            }),
        ),
    );

    // Transform fit with 15° rotation
    let r4 = {
        let deg: f32 = 15.0;
        let rad = deg.to_radians();
        let (sin, cos) = rad.sin_cos();
        rect(
            gap * 3.0,
            0.0,
            s,
            s,
            image_paint_with(
                img(),
                ImagePaintFit::Transform(AffineTransform {
                    matrix: [[cos, -sin, 0.0], [sin, cos, 0.0]],
                }),
            ),
        )
    };

    // Quarter turns + alignment + Screen blend
    let r5 = rect(
        gap * 4.0,
        0.0,
        s,
        s,
        Paint::Image(ImagePaint {
            active: true,
            image: img(),
            fit: ImagePaintFit::Fit(BoxFit::Cover),
            filters: ImageFilters::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Screen,
            quarter_turns: 2,
            alignement: Alignment::BOTTOM_RIGHT,
        }),
    );

    flat_scene("L0 Image", vec![r1, r2, r3, r4, r5])
}
