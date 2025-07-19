pub struct EllipseShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
}

pub fn build_ellipse_path(shape: &EllipseShape) -> skia_safe::Path {
    let mut path = skia_safe::Path::new();
    path.add_oval(
        skia_safe::Rect::from_xywh(0.0, 0.0, shape.width, shape.height),
        None,
    );
    path
}
