use crate::node::schema::ArcNode;
use skia_safe::{Path, Rect};

/// Build a closed arc path for [`ArcNode`].
pub fn build_arc_path(node: &ArcNode) -> Path {
    let mut path = Path::new();

    let w = node.size.width;
    let h = node.size.height;
    let cx = w / 2.0;
    let cy = h / 2.0;
    let rx = w / 2.0;
    let ry = h / 2.0;
    let inner_rx = rx * node.inner_radius;
    let inner_ry = ry * node.inner_radius;

    let start_deg = node.start_angle;
    let sweep_deg = node.angle;
    let end_deg = start_deg + sweep_deg;

    let start_rad = start_deg.to_radians();
    let end_rad = end_deg.to_radians();

    let start_point = (cx + rx * start_rad.cos(), cy + ry * start_rad.sin());
    path.move_to(start_point);

    let outer_rect = Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0);
    path.arc_to(outer_rect, start_deg, sweep_deg, false);

    if node.inner_radius > 0.0 {
        let end_inner = (cx + inner_rx * end_rad.cos(), cy + inner_ry * end_rad.sin());
        path.line_to(end_inner);

        let inner_rect =
            Rect::from_xywh(cx - inner_rx, cy - inner_ry, inner_rx * 2.0, inner_ry * 2.0);
        path.arc_to(inner_rect, end_deg, -sweep_deg, false);
    } else {
        path.line_to((cx, cy));
    }

    path.close();
    path
}
