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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SvgError(pub String);

impl std::fmt::Display for SvgError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "svgout: {}", self.0)
    }
}

impl std::error::Error for SvgError {}

#[derive(Debug, Clone, PartialEq)]
enum SvgFill {
    None,
    Solid { color: Color, active: bool },
}

impl SvgFill {
    fn attributes(&self, property: &str) -> String {
        match self {
            SvgFill::None | SvgFill::Solid { active: false, .. } => {
                format!(r#"{property}="none""#)
            }
            SvgFill::Solid {
                color,
                active: true,
            } => {
                let opacity = color.opacity();
                if opacity == 1.0 {
                    format!(r#"{property}="{}""#, color.to_hex())
                } else {
                    format!(
                        r#"{property}="{}" {property}-opacity="{opacity}""#,
                        color.to_hex()
                    )
                }
            }
        }
    }
}

fn svg_fill(node: &Node) -> Result<SvgFill, SvgError> {
    if !node.strokes.is_empty() {
        return Err(SvgError(format!(
            "node {} uses authored strokes the SVG snapshot subset cannot represent",
            node.id
        )));
    }
    svg_fill_paints(&node.fills, &format!("node {}", node.id))
}

fn svg_fill_paints(paints: &Paints, owner: &str) -> Result<SvgFill, SvgError> {
    match paints.as_slice() {
        [] => Ok(SvgFill::None),
        [Paint::Solid(solid)] if solid.blend_mode == BlendMode::Normal => Ok(SvgFill::Solid {
            color: solid.color,
            active: solid.active,
        }),
        [Paint::Solid(_)] => Err(SvgError(format!(
            "{owner} uses a solid blend mode the SVG snapshot subset cannot represent"
        ))),
        [_] => Err(SvgError(format!(
            "{owner} uses a rich paint the SVG snapshot subset cannot represent"
        ))),
        paints => Err(SvgError(format!(
            "{owner} has {} paints; the SVG snapshot subset supports at most one solid",
            paints.len()
        ))),
    }
}

fn escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_attr(value: &str) -> String {
    escape_text(value).replace('"', "&quot;")
}

pub fn render(doc: &Document, resolved: &Resolved, opts: &SvgOptions) -> Result<String, SvgError> {
    let mut out = String::new();
    let _ = writeln!(
        out,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="monospace">"#,
        w = opts.width,
        h = opts.height
    );
    paint(doc, doc.root, resolved, &mut out)?;
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
    Ok(out)
}

fn paint(
    doc: &Document,
    id: NodeId,
    resolved: &Resolved,
    out: &mut String,
) -> Result<(), SvgError> {
    let node = doc.get(id);
    let Some(world) = resolved.world_opt(id) else {
        return Ok(()); // hidden
    };
    let world = &world;
    let b = resolved.box_of(id);
    if !node.corner_radius.is_zero() || !node.corner_smoothing.is_zero() {
        return Err(SvgError(format!(
            "node {} uses corner geometry the SVG snapshot subset cannot represent losslessly",
            node.id
        )));
    }
    if node.header.opacity != 1.0 {
        return Err(SvgError(format!(
            "node {} uses subtree opacity the SVG snapshot subset cannot represent",
            node.id
        )));
    }
    if matches!(
        node.payload,
        Payload::Frame {
            clips_content: true,
            ..
        }
    ) {
        return Err(SvgError(format!(
            "node {} clips content, which the SVG snapshot subset cannot represent",
            node.id
        )));
    }
    let fill = svg_fill(node)?;

    match &node.payload {
        Payload::Frame { .. } => {
            let fill = fill.attributes("fill");
            let _ = writeln!(
                out,
                r#"  <rect width="{}" height="{}" transform="{}" {}/>"#,
                b.w,
                b.h,
                mat(world),
                fill
            );
        }
        Payload::Shape { desc } => match desc {
            ShapeDesc::Rect => {
                let fill = fill.attributes("fill");
                let _ = writeln!(
                    out,
                    r#"  <rect width="{}" height="{}" transform="{}" {}/>"#,
                    b.w,
                    b.h,
                    mat(world),
                    fill
                );
            }
            ShapeDesc::Ellipse => {
                let fill = fill.attributes("fill");
                let _ = writeln!(
                    out,
                    r#"  <ellipse cx="{}" cy="{}" rx="{}" ry="{}" transform="{}" {}/>"#,
                    b.w / 2.0,
                    b.h / 2.0,
                    b.w / 2.0,
                    b.h / 2.0,
                    mat(world),
                    fill
                );
            }
            ShapeDesc::Line => {
                let stroke = fill.attributes("stroke");
                let _ = writeln!(
                    out,
                    r#"  <line x1="0" y1="0" x2="{}" y2="0" transform="{}" {} stroke-width="2"/>"#,
                    b.w,
                    mat(world),
                    stroke
                );
            }
            ShapeDesc::Path(path) => {
                let fill = fill.attributes("fill");
                let transform = world.then(&Affine::scale(b.w, b.h));
                let fill_rule = match path.fill_rule {
                    FillRule::NonZero => "nonzero",
                    FillRule::EvenOdd => "evenodd",
                };
                let _ = writeln!(
                    out,
                    r#"  <path d="{}" transform="{}" fill-rule="{}" {}/>"#,
                    // SVG snapshot/export is an explicit foreign-language
                    // boundary and therefore parses its own validated SVG d.
                    // Internal bounds, damage, drawlist, and paint use only
                    // the shared rational-conic artifact.
                    escape_attr(path.d.as_ref()),
                    mat(&transform),
                    fill_rule,
                    fill
                );
            }
        },
        Payload::Text { content, font_size } => {
            let fill = fill.attributes("fill");
            let _ = writeln!(
                out,
                r#"  <text x="0" y="{}" transform="{}" font-size="{}" {}>{}</text>"#,
                font_size,
                mat(world),
                font_size,
                fill,
                escape_text(content)
            );
        }
        Payload::AttributedText {
            attributed_string,
            default_style,
        } => {
            attributed_string
                .validate()
                .map_err(|error| SvgError(format!("node {}: {error}", node.id)))?;
            let fill = fill.attributes("fill");
            let italic = if default_style.font_style_italic {
                r#" font-style="italic""#
            } else {
                ""
            };
            let _ = write!(
                out,
                r#"  <text x="0" y="{}" transform="{}" font-size="{}" font-weight="{}"{} {}>"#,
                default_style.font_size,
                mat(world),
                default_style.font_size,
                default_style.font_weight,
                italic,
                fill,
            );
            for (index, run) in attributed_string.runs.iter().enumerate() {
                let run_fill = run
                    .fills
                    .as_ref()
                    .map(|fills| svg_fill_paints(fills, &format!("node {} run {index}", node.id)))
                    .transpose()?;
                let run_text = escape_text(attributed_string.run_text(run));
                let needs_tspan = run.style != *default_style || run_fill.is_some();
                if !needs_tspan {
                    let _ = write!(out, "{run_text}");
                    continue;
                }
                let _ = write!(
                    out,
                    r#"<tspan font-size="{}" font-weight="{}""#,
                    run.style.font_size, run.style.font_weight
                );
                if run.style.font_style_italic {
                    let _ = write!(out, r#" font-style="italic""#);
                } else if default_style.font_style_italic {
                    let _ = write!(out, r#" font-style="normal""#);
                }
                if let Some(run_fill) = run_fill {
                    let _ = write!(out, " {}", run_fill.attributes("fill"));
                }
                let _ = write!(out, ">{run_text}</tspan>");
            }
            let _ = writeln!(out, "</text>");
        }
        Payload::Group | Payload::Lens { .. } => {}
    }

    for c in &node.children {
        paint(doc, *c, resolved, out)?;
    }
    Ok(())
}
