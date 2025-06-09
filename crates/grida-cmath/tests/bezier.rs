use grida_cmath::{bezier_a2c};

/// Converts the output of `bezier_a2c` to an SVG path string.
fn a2c_to_svg_path(x1: f32, y1: f32, data: &[f32]) -> String {
    let mut path = format!("M {} {}", x1, y1);
    for chunk in data.chunks(6) {
        if let [c1x, c1y, c2x, c2y, x, y] = *chunk {
            path.push_str(&format!(" C {} {}, {} {}, {} {}", c1x, c1y, c2x, c2y, x, y));
        }
    }
    path
}

/// Helper to prepend the start point to the cubic bezier points.
fn get_bezier_points(x1: f32, y1: f32, data: &[f32]) -> Vec<f32> {
    let mut out = Vec::with_capacity(2 + data.len());
    out.push(x1);
    out.push(y1);
    out.extend_from_slice(data);
    out
}

#[test]
fn simple_arc_svg_path() {
    let res = bezier_a2c(0.0, 0.0, 1.0, 1.0, 0.0, false, false, 100.0, 0.0, None);
    let d = a2c_to_svg_path(0.0, 0.0, &res);
    assert_eq!(d, "M 0 0 C -0.0000033649048 38.490025, 41.66666 62.546284, 75 43.301273 C 90.470055 34.369633, 100 17.863281, 100 0");
}

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

    let res = bezier_a2c(x1, y1, rx, ry, angle, large_arc_flag, sweep_flag, x2, y2, None);
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

    let res = bezier_a2c(x1, y1, rx, ry, angle, large_arc_flag, sweep_flag, x2, y2, None);
    let pts = get_bezier_points(x1, y1, &res);
    assert!(pts.len() > 8);
    assert_eq!(pts.len(), 20);
    assert!((pts[0] - x1).abs() < 1e-6);
    assert!((pts[1] - y1).abs() < 1e-6);
    assert!((pts[pts.len() - 2] - x2).abs() < 1e-6);
    assert!((pts[pts.len() - 1] - y2).abs() < 1e-6);
}

