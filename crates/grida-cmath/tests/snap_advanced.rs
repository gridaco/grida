use grida_cmath::{snap1d, Snap1DResult, snap2d_axis_aligned, AxisAlignedPoint, Snap2DAxisConfig, movement_normalize, axis_locked_by_dominance};

#[test]
fn snap1d_basic() {
    let r = snap1d(&[8.0], &[0.0,10.0], 5.0, 0.0);
    assert_eq!(r.distance, 2.0);
    assert_eq!(r.hit_agent_indices, vec![0]);
    assert_eq!(r.hit_anchor_indices, vec![1]);
}

#[test]
fn snap2d_axis() {
    let agents = [[5.0,5.0]];
    let anchors: [AxisAlignedPoint;2] = [(Some(10.0), Some(5.0)), (None, Some(2.0))];
    let res = snap2d_axis_aligned(&agents, &anchors, Snap2DAxisConfig{ x: Some(6.0), y: Some(4.0) }, 0.0);
    assert!(res.x.is_some());
    assert!(res.y.is_some());
}

#[test]
fn movement_helpers() {
    let v = movement_normalize((Some(2.0), None));
    assert_eq!(v, [2.0,0.0]);
    let locked = axis_locked_by_dominance((Some(3.0), Some(1.0)));
    assert_eq!(locked, (Some(3.0), None));
}

