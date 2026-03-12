use super::*;
use cg::cg::alignment::Alignment;
use math2::box_fit::BoxFit;
use math2::transform::AffineTransform;

pub fn build() -> Scene {
    let s = 150.0;
    let gap = 170.0;
    let img = || ResourceRef::HASH(SYSTEM_IMAGE.to_owned());

    // Cover fit
    let r1 = rect(0.0, 0.0, s, s,
        image_paint_with(img(), ImagePaintFit::Fit(BoxFit::Cover)));

    // Contain fit
    let r2 = rect(gap, 0.0, s, s,
        image_paint_with(img(), ImagePaintFit::Fit(BoxFit::Contain)));

    // Transform fit (scale + offset)
    let r3 = rect(gap * 2.0, 0.0, s, s,
        image_paint_with(img(), ImagePaintFit::Transform(AffineTransform::new(10.0, 20.0, 0.0))));

    // Quarter turns + alignment + Screen blend
    let r4 = rect(gap * 3.0, 0.0, s, s,
        Paint::Image(ImagePaint {
            active: true,
            image: img(),
            fit: ImagePaintFit::Fit(BoxFit::Cover),
            filters: ImageFilters::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Screen,
            quarter_turns: 2,
            alignement: Alignment::BOTTOM_RIGHT,
        }));

    flat_scene("L0 Image", vec![r1, r2, r3, r4])
}
