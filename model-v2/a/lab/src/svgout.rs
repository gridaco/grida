//! SVG snapshots of resolved documents — E1 visual evidence.
//! Renders each node with its world matrix; optionally overlays world AABBs.

use crate::math::Affine;
use crate::model::*;
use crate::resolve::Resolved;
use std::fmt::Write as _;

fn mat(t: &Affine) -> String {
    format!("matrix({} {} {} {} {} {})", t.a, t.b, t.c, t.d, t.e, t.f)
}

pub struct SvgOptions {
    pub show_aabb: bool,
    pub width: f32,
    pub height: f32,
}

pub fn render(doc: &Document, resolved: &Resolved, opts: &SvgOptions) -> String {
    let mut out = String::new();
    let _ = writeln!(
        out,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="monospace">"#,
        w = opts.width,
        h = opts.height
    );
    paint(doc, doc.root, resolved, &mut out);
    if opts.show_aabb {
        for (i, slot) in resolved.world_aabb.iter().enumerate() {
            let (id, aabb) = match slot {
                Some(a) => (i as NodeId, a),
                None => continue,
            };
            if id == doc.root {
                continue;
            }
            let _ = writeln!(
                out,
                r##"  <rect x="{}" y="{}" width="{}" height="{}" fill="none" stroke="#f0f" stroke-width="0.5" stroke-dasharray="3 3"/>"##,
                aabb.x, aabb.y, aabb.w, aabb.h
            );
        }
    }
    let _ = writeln!(out, "</svg>");
    out
}

fn paint(doc: &Document, id: NodeId, resolved: &Resolved, out: &mut String) {
    let node = doc.get(id);
    let Some(world) = resolved.world_opt(id) else {
        return; // hidden
    };
    let world = &world;
    let b = resolved.box_of(id);
    let fill = node.fill.as_deref();

    match &node.payload {
        Payload::Frame { .. } => {
            let f = fill.unwrap_or("#f6f6f6");
            let _ = writeln!(
                out,
                r##"  <rect width="{}" height="{}" transform="{}" fill="{}" stroke="#999" stroke-width="1"/>"##,
                b.w,
                b.h,
                mat(world),
                f
            );
        }
        Payload::Shape { desc } => {
            let f = fill.unwrap_or("#4a90d9");
            match desc {
                ShapeDesc::Rect => {
                    let _ = writeln!(
                        out,
                        r#"  <rect width="{}" height="{}" transform="{}" fill="{}"/>"#,
                        b.w,
                        b.h,
                        mat(world),
                        f
                    );
                }
                ShapeDesc::Ellipse => {
                    let _ = writeln!(
                        out,
                        r#"  <ellipse cx="{}" cy="{}" rx="{}" ry="{}" transform="{}" fill="{}"/>"#,
                        b.w / 2.0,
                        b.h / 2.0,
                        b.w / 2.0,
                        b.h / 2.0,
                        mat(world),
                        f
                    );
                }
                ShapeDesc::Line => {
                    let _ = writeln!(
                        out,
                        r#"  <line x1="0" y1="0" x2="{}" y2="0" transform="{}" stroke="{}" stroke-width="2"/>"#,
                        b.w,
                        mat(world),
                        f
                    );
                }
            }
        }
        Payload::Text { content, font_size } => {
            let _ = writeln!(
                out,
                r#"  <text x="0" y="{}" transform="{}" font-size="{}" fill="{}">{}</text>"#,
                font_size,
                mat(world),
                font_size,
                fill.unwrap_or("#222"),
                content
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;")
            );
        }
        Payload::Group | Payload::Lens { .. } => {}
    }

    for c in &node.children {
        paint(doc, *c, resolved, out);
    }
}
