use cg::node::schema::Size;
use cg::runtime::camera::Camera2D;

#[test]
fn zoom_at_preserves_anchor() {
    let mut cam = Camera2D::new(Size {
        width: 200.0,
        height: 200.0,
    });
    cam.set_center(0.0, 0.0);
    cam.set_zoom(1.0);
    let anchor = [50.0, 50.0];
    let before = cam.screen_to_canvas_point(anchor);
    cam.set_zoom_at(2.0, anchor);
    let after = cam.screen_to_canvas_point(anchor);
    assert!((before[0] - after[0]).abs() < f32::EPSILON);
    assert!((before[1] - after[1]).abs() < f32::EPSILON);
}
