//! tiny-skia utilities
//! we don't use tiny-skia in our main rendering pipeline, but by the nature of rust ecosystem, some of the main dependencies relies on it,
//! this module provides a bridge for it.

use skia_safe::Path as SkPath;
use usvg::tiny_skia_path::{Path as TinyPath, PathSegment};

pub(crate) fn tsk_path_to_sk_path(path: &TinyPath) -> SkPath {
    let mut sk_path = SkPath::new();
    for segment in path.segments() {
        match segment {
            PathSegment::MoveTo(p) => {
                sk_path.move_to((p.x, p.y));
            }
            PathSegment::LineTo(p) => {
                sk_path.line_to((p.x, p.y));
            }
            PathSegment::QuadTo(p0, p1) => {
                sk_path.quad_to((p0.x, p0.y), (p1.x, p1.y));
            }
            PathSegment::CubicTo(p0, p1, p2) => {
                sk_path.cubic_to((p0.x, p0.y), (p1.x, p1.y), (p2.x, p2.y));
            }
            PathSegment::Close => {
                sk_path.close();
            }
        }
    }
    sk_path
}
