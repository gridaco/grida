use crate::{geometry_cache::GeometryCache, rect::Rect, schema::NodeId};
use math2::transform::AffineTransform;

pub fn transform_point(t: &AffineTransform, x: f32, y: f32) -> (f32, f32) {
    let [[a, c, tx], [b, d, ty]] = t.matrix;
    let nx = a * x + c * y + tx;
    let ny = b * x + d * y + ty;
    (nx, ny)
}

pub fn transform_rect(rect: &Rect, t: &AffineTransform) -> Rect {
    let (x0, y0) = transform_point(t, rect.min_x, rect.min_y);
    let (x1, y1) = transform_point(t, rect.max_x, rect.min_y);
    let (x2, y2) = transform_point(t, rect.min_x, rect.max_y);
    let (x3, y3) = transform_point(t, rect.max_x, rect.max_y);
    let min_x = x0.min(x1.min(x2.min(x3)));
    let min_y = y0.min(y1.min(y2.min(y3)));
    let max_x = x0.max(x1.max(x2.max(x3)));
    let max_y = y0.max(y1.max(y2.max(y3)));
    Rect {
        min_x,
        min_y,
        max_x,
        max_y,
    }
}

pub fn scale_rect(rect: &Rect, scale: f32) -> Rect {
    Rect {
        min_x: rect.min_x * scale,
        min_y: rect.min_y * scale,
        max_x: rect.max_x * scale,
        max_y: rect.max_y * scale,
    }
}

pub fn is_node_visible(cache: &GeometryCache, id: &NodeId, viewport: &Rect) -> bool {
    if let Some(bounds) = cache.get_world_bounds(id) {
        bounds.intersects(viewport)
    } else {
        false
    }
}
