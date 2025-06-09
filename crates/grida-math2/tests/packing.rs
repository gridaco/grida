use grida_cmath::{Rectangle, packing_fit};

fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
    Rectangle {
        x,
        y,
        width: w,
        height: h,
    }
}

#[test]
fn returns_top_left_when_no_anchors() {
    let view = rect(0.0, 0.0, 100.0, 100.0);
    let agent = (10.0, 10.0);
    let res = packing_fit(view, agent, &[]);
    assert_eq!(res, Some(rect(0.0, 0.0, 10.0, 10.0)));
}

#[test]
fn next_free_region_when_anchor_blocks_top_left() {
    let view = rect(0.0, 0.0, 100.0, 100.0);
    let agent = (10.0, 10.0);
    let anchors = [rect(0.0, 0.0, 50.0, 50.0)];
    let res = packing_fit(view, agent, &anchors);
    assert_eq!(res, Some(rect(50.0, 0.0, 10.0, 10.0)));
}

#[test]
fn returns_none_when_agent_larger_than_view() {
    let view = rect(0.0, 0.0, 30.0, 30.0);
    let agent = (40.0, 40.0);
    let res = packing_fit(view, agent, &[]);
    assert!(res.is_none());
}

#[test]
fn top_most_free_region_when_multiple_free_areas() {
    let view = rect(0.0, 0.0, 100.0, 100.0);
    let agent = (20.0, 20.0);
    let anchors = [rect(40.0, 40.0, 20.0, 20.0)];
    let res = packing_fit(view, agent, &anchors);
    assert_eq!(res, Some(rect(0.0, 0.0, 20.0, 20.0)));
}

#[test]
fn complex_anchors_choose_lexicographically_smallest() {
    let view = rect(0.0, 0.0, 200.0, 200.0);
    let agent = (50.0, 50.0);
    let anchors = [
        rect(25.0, 25.0, 100.0, 50.0),
        rect(75.0, 75.0, 100.0, 100.0),
        rect(-50.0, 150.0, 100.0, 50.0),
    ];
    let res = packing_fit(view, agent, &anchors);
    assert_eq!(res, Some(rect(125.0, 25.0, 50.0, 50.0)));
}
