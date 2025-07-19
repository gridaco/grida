use skia_safe;

pub struct EllipticalRingShape {
    /// size of the box
    pub size: skia_safe::Size,
    /// inner radius in 0..1
    pub inner_radius: f32,
}

pub fn build_ring_path(shape: EllipticalRingShape) -> skia_safe::Path {
    let mut path = skia_safe::Path::new();

    let w = shape.size.width;
    let h = shape.size.height;
    let cx = w / 2.0;
    let cy = h / 2.0;
    let rx = w / 2.0;
    let ry = h / 2.0;
    let inner_rx = rx * shape.inner_radius;
    let inner_ry = ry * shape.inner_radius;

    // Create outer ellipse (clockwise)
    let outer_rect = skia_safe::Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0);
    path.add_oval(outer_rect, None);

    // Create inner ellipse (counter-clockwise) to create the hole
    let inner_rect =
        skia_safe::Rect::from_xywh(cx - inner_rx, cy - inner_ry, inner_rx * 2.0, inner_ry * 2.0);
    path.add_oval(inner_rect, Some((skia_safe::PathDirection::CCW, 0)));

    path
}
