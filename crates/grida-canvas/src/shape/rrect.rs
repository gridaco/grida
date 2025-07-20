use crate::cg::types::*;

pub struct RRectShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
    /// corner radius
    pub corner_radius: RectangularCornerRadius,
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
    let mut path = skia_safe::Path::new();
    path.add_rrect(build_rrect(shape), None);
    path
}
