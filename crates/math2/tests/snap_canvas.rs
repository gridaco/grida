use math2::{snap_to_canvas_geometry, Rectangle, Snap2DAxisConfig, SnapGuide};

fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle {
        x,
        y,
        width: w,
        height: h,
    }
}

#[test]
fn snap_to_canvas_by_guide() {
    let agent = rect(5.0, 5.0, 10.0, 10.0);
    let anchors = [] as [Rectangle; 0];
    let guides = [SnapGuide {
        axis: math2::vector2::Axis::X,
        offset: 20.0,
    }];
    let res = snap_to_canvas_geometry(
        agent,
        &anchors,
        &guides,
        Snap2DAxisConfig {
            x: Some(6.0),
            y: None,
        },
        0.0,
    );
    assert_eq!(res.delta, [5.0, 0.0]);
    assert_eq!(res.translated.x, 10.0);
}
