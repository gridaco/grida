use math2::{
    bezier_a2c, bezier_evaluate, bezier_project, bezier_solve_tangents_for_point, bezier_subdivide,
    CubicBezierWithTangents,
};

fn seg(a: [f32; 2], b: [f32; 2], ta: [f32; 2], tb: [f32; 2]) -> CubicBezierWithTangents {
    CubicBezierWithTangents { a, b, ta, tb }
}

fn close(p: [f32; 2], q: [f32; 2], eps: f32) -> bool {
    (p[0] - q[0]).abs() <= eps && (p[1] - q[1]).abs() <= eps
}

/// Helper to prepend the start point to the cubic bezier points.
fn get_bezier_points(x1: f32, y1: f32, data: &[f32]) -> Vec<f32> {
    let mut out = Vec::with_capacity(2 + data.len());
    out.push(x1);
    out.push(y1);
    out.extend_from_slice(data);
    out
}

// /// Converts the output of `bezier_a2c` to an SVG path string.
// fn a2c_to_svg_path(x1: f32, y1: f32, data: &[f32]) -> String {
//     let mut path = format!("M {} {}", x1, y1);
//     for chunk in data.chunks(6) {
//         if let [c1x, c1y, c2x, c2y, x, y] = *chunk {
//             path.push_str(&format!(" C {} {}, {} {}, {} {}", c1x, c1y, c2x, c2y, x, y));
//         }
//     }
//     path
// }

// enable this later. for some reason, the output path data has percision differences in different machines.
// #[test]
// fn simple_arc_svg_path() {
//     let res = bezier_a2c(0.0, 0.0, 1.0, 1.0, 0.0, false, false, 100.0, 0.0, None);
//     let d = a2c_to_svg_path(0.0, 0.0, &res);
//     assert_eq!(
//         d,
//         "M 0 0 C -0.0000033649048 38.490025, 41.66666 62.546284, 75 43.301273 C 90.470055 34.369633, 100 17.863281, 100 0"
//     );
// }

#[test]
fn simple_arc_values() {
    let x1 = 0.0;
    let y1 = 0.0;
    let rx = 50.0;
    let ry = 50.0;
    let angle = 0.0;
    let large_arc_flag = false;
    let sweep_flag = true;
    let x2 = 50.0;
    let y2 = 50.0;

    let res = bezier_a2c(
        x1,
        y1,
        rx,
        ry,
        angle,
        large_arc_flag,
        sweep_flag,
        x2,
        y2,
        None,
    );
    let pts = get_bezier_points(x1, y1, &res);
    assert_eq!(pts.len(), 8);
    assert!((pts[0] - x1).abs() < 1e-6);
    assert!((pts[1] - y1).abs() < 1e-6);
    assert!((pts[6] - x2).abs() < 1e-6);
    assert!((pts[7] - y2).abs() < 1e-6);
    assert!((pts[2] - 27.614237).abs() < 0.001);
    assert!((pts[3]).abs() < 1e-5);
    assert!((pts[4] - 50.0).abs() < 1e-6);
    assert!((pts[5] - 22.385763).abs() < 0.001);
}

#[test]
fn large_arc_flag() {
    let x1 = 0.0;
    let y1 = 0.0;
    let rx = 50.0;
    let ry = 50.0;
    let angle = 0.0;
    let large_arc_flag = true;
    let sweep_flag = true;
    let x2 = 50.0;
    let y2 = 50.0;

    let res = bezier_a2c(
        x1,
        y1,
        rx,
        ry,
        angle,
        large_arc_flag,
        sweep_flag,
        x2,
        y2,
        None,
    );
    let pts = get_bezier_points(x1, y1, &res);
    assert!(pts.len() > 8);
    assert_eq!(pts.len(), 20);
    assert!((pts[0] - x1).abs() < 1e-6);
    assert!((pts[1] - y1).abs() < 1e-6);
    assert!((pts[pts.len() - 2] - x2).abs() < 1e-6);
    assert!((pts[pts.len() - 1] - y2).abs() < 1e-6);
}

#[test]
fn evaluate_endpoint_identities() {
    let c = seg([10.0, 20.0], [110.0, 40.0], [30.0, -50.0], [-30.0, -50.0]);
    assert!(close(bezier_evaluate(&c, 0.0), c.a, 1e-6));
    assert!(close(bezier_evaluate(&c, 1.0), c.b, 1e-6));
    // Clamping: out-of-range and NaN parameters land on the endpoints.
    assert!(close(bezier_evaluate(&c, -1.0), c.a, 1e-6));
    assert!(close(bezier_evaluate(&c, 2.0), c.b, 1e-6));
    assert!(close(bezier_evaluate(&c, f32::NAN), c.a, 1e-6));
}

#[test]
fn evaluate_straight_line_midpoint() {
    let c = seg([0.0, 0.0], [100.0, 60.0], [0.0, 0.0], [0.0, 0.0]);
    assert!(close(bezier_evaluate(&c, 0.5), [50.0, 30.0], 1e-4));
}

#[test]
fn subdivide_preserves_shape() {
    let c = seg([0.0, 0.0], [100.0, 0.0], [25.0, 60.0], [-25.0, 60.0]);
    for &t in &[0.25f32, 0.5, 0.7321] {
        let (l, r) = bezier_subdivide(&c, t);
        assert!(close(l.a, c.a, 1e-5));
        assert!(close(r.b, c.b, 1e-5));
        assert!(close(l.b, r.a, 1e-5));
        assert!(close(l.b, bezier_evaluate(&c, t), 1e-3));
        // Dense sampling: each half reproduces its span of the original.
        for i in 0..=32 {
            let u = i as f32 / 32.0;
            let on_original = bezier_evaluate(&c, u);
            let on_half = if u <= t {
                bezier_evaluate(&l, u / t)
            } else {
                bezier_evaluate(&r, (u - t) / (1.0 - t))
            };
            assert!(
                close(on_original, on_half, 1e-2),
                "t={t} u={u}: {on_original:?} vs {on_half:?}"
            );
        }
    }
}

#[test]
fn subdivide_straight_line_is_collinear_not_zero() {
    // De Casteljau on a straight chord yields collinear (shape-identical)
    // but nonzero tangents — zero preservation is the caller's policy.
    let c = seg([0.0, 0.0], [100.0, 0.0], [0.0, 0.0], [0.0, 0.0]);
    let (l, r) = bezier_subdivide(&c, 0.5);
    assert!(close(l.b, [50.0, 0.0], 1e-5));
    for i in 0..=8 {
        let u = i as f32 / 8.0;
        assert!(bezier_evaluate(&l, u)[1].abs() < 1e-4);
        assert!(bezier_evaluate(&r, u)[1].abs() < 1e-4);
    }
}

#[test]
fn project_straight_line() {
    let c = seg([0.0, 0.0], [100.0, 0.0], [0.0, 0.0], [0.0, 0.0]);
    let (t, dist_sq) = bezier_project(&c, [50.0, 10.0]);
    assert!((t - 0.5).abs() < 1e-3, "t={t}");
    assert!((dist_sq - 100.0).abs() < 1e-2);
    // Beyond the end: clamped.
    let (t, _) = bezier_project(&c, [140.0, 0.0]);
    assert!((t - 1.0).abs() < 1e-6);
    let (t, _) = bezier_project(&c, [-40.0, 5.0]);
    assert!(t.abs() < 1e-6);
}

#[test]
fn project_symmetric_curve_apex() {
    let c = seg([0.0, 0.0], [100.0, 0.0], [25.0, 60.0], [-25.0, 60.0]);
    let apex = bezier_evaluate(&c, 0.5);
    let (t, dist_sq) = bezier_project(&c, [apex[0], apex[1] + 20.0]);
    assert!((t - 0.5).abs() < 1e-3, "t={t}");
    assert!((dist_sq - 400.0).abs() < 1.0);
    // A point on the curve projects onto itself.
    let on = bezier_evaluate(&c, 0.3);
    let (t, dist_sq) = bezier_project(&c, on);
    assert!((t - 0.3).abs() < 1e-3, "t={t}");
    assert!(dist_sq < 1e-4);
}

#[test]
fn solve_tangents_reaches_target() {
    let c = seg([0.0, 0.0], [100.0, 0.0], [10.0, 30.0], [-10.0, 30.0]);
    let target = [40.0, 55.0];
    let (ta, tb) = bezier_solve_tangents_for_point(&c, 0.4, target);
    let bent = seg(c.a, c.b, ta, tb);
    assert!(
        close(bezier_evaluate(&bent, 0.4), target, 1e-2),
        "{:?}",
        bezier_evaluate(&bent, 0.4)
    );
}

#[test]
fn solve_tangents_endpoint_edge_cases() {
    let c = seg([0.0, 0.0], [100.0, 0.0], [10.0, 30.0], [-10.0, 30.0]);
    let (ta, tb) = bezier_solve_tangents_for_point(&c, 0.0, [5.0, 7.0]);
    assert!(close(ta, [5.0, 7.0], 1e-6));
    assert!(close(tb, c.tb, 1e-6));
    let (ta, tb) = bezier_solve_tangents_for_point(&c, 1.0, [90.0, -4.0]);
    assert!(close(ta, c.ta, 1e-6));
    assert!(close(tb, [-10.0, -4.0], 1e-6));
}

#[test]
fn solve_tangents_near_chord_goes_straight() {
    let c = seg([0.0, 0.0], [100.0, 0.0], [10.0, 30.0], [-10.0, 30.0]);
    // Target within 0.1 of the chord's linear interpolation at t.
    let (ta, tb) = bezier_solve_tangents_for_point(&c, 0.5, [50.0, 0.05]);
    assert!(close(ta, [0.0, 0.0], 1e-6));
    assert!(close(tb, [0.0, 0.0], 1e-6));
}

#[test]
fn get_bbox_catches_symmetric_extremum() {
    // Symmetric bulge: the derivative's t² coefficient vanishes, so the
    // extremum comes from the degenerate (linear) root. x(t) reaches
    // −30 at t=0.5.
    let c = seg([0.0, 0.0], [0.0, 100.0], [-40.0, 30.0], [-40.0, -30.0]);
    let bb = math2::bezier_get_bbox(&c);
    assert!((bb.x - -30.0).abs() < 1e-3, "bb.x={}", bb.x);
}
