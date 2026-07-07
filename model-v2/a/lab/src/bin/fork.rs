//! DEC-0 fork generator — the SAME scenes resolved under BOTH rotation
//! framings (layout-visible `AabbParticipates` vs CSS `VisualOnly`),
//! dumped side-by-side for the fork demo. Nothing here is a mockup: every
//! frame of both arms is real resolver output, and the metrics (sibling
//! overlap px², container breathing, ink escape px) are measured on the
//! resolved world AABBs — E1's method, applied to the whole scene battery.
//!
//! Output: ../dec0-fork/fork.json

use anchor_lab::math::RectF;
use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, ResolveOptions, Resolved, RotationInFlow};
use std::fmt::Write as _;
use std::fs;

const STEP: f32 = 3.0;
const MAX_T: f32 = 180.0;

type Built = (Document, Vec<(NodeId, &'static str)>);

struct Scene {
    id: &'static str,
    name: &'static str,
    build: fn(f32) -> Built,
}

fn opts(arm: RotationInFlow) -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 600.0),
        rotation_in_flow: arm,
    }
}

fn frame_flex(w: SizeIntent, h: SizeIntent, gap: f32, pad: f32) -> (Header, Payload) {
    (
        Header::new(w, h),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                gap_main: gap,
                padding: EdgeInsets::all(pad),
                cross_align: CrossAlign::Center,
                ..Default::default()
            },
            clips_content: false,
        },
    )
}

fn card(w: f32, h: f32) -> (Header, Payload) {
    (
        Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    )
}

fn at(mut h: Header, x: f32, y: f32) -> Header {
    h.x = AxisBinding::start(x);
    h.y = AxisBinding::start(y);
    h
}

// --- scenes (container first; measured siblings after) -----------------

/// grow: fixed row, middle card grow=1 rotating — DEC-1's home turf.
fn s_grow(theta: f32) -> Built {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(SizeIntent::Fixed(460.0), SizeIntent::Fixed(170.0), 10.0, 10.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut out = vec![(f, "container")];
    for i in 0..3 {
        let (mut ch, cp) = card(60.0, 100.0);
        if i == 1 {
            ch.grow = 1.0;
            ch.rotation = theta;
        }
        out.push((b.add(f, ch, cp), ["a", "grow+rot", "c"][i]));
    }
    (b.build(), out)
}

/// stretch: cross-axis fill rotating.
fn s_stretch(theta: f32) -> Built {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(SizeIntent::Fixed(460.0), SizeIntent::Fixed(190.0), 10.0, 10.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut out = vec![(f, "container")];
    for i in 0..3 {
        let (mut ch, cp) = card(60.0, 100.0);
        if i == 1 {
            ch.self_align = SelfAlign::Stretch;
            ch.rotation = theta;
        }
        out.push((b.add(f, ch, cp), ["a", "stretch+rot", "c"][i]));
    }
    (b.build(), out)
}

/// text: a label turning vertical inside a toolbar row (the writing-mode case).
fn s_text(theta: f32) -> Built {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(SizeIntent::Auto, SizeIntent::Fixed(170.0), 10.0, 10.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut out = vec![(f, "container")];
    let (h1, p1) = card(60.0, 100.0);
    out.push((b.add(f, h1, p1), "a"));
    let mut th = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    th.rotation = theta;
    let t = b.add(
        f,
        th,
        Payload::Text {
            content: "revenue".into(),
            font_size: 18.0,
        },
    );
    out.push((t, "text+rot"));
    let (h2, p2) = card(60.0, 100.0);
    out.push((b.add(f, h2, p2), "c"));
    (b.build(), out)
}

/// hug: auto-width row, LAST card rotating — the containment fork.
fn s_hug(theta: f32) -> Built {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(SizeIntent::Auto, SizeIntent::Fixed(190.0), 10.0, 10.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut out = vec![(f, "container (hug)")];
    for i in 0..3 {
        let (mut ch, cp) = card(60.0, 100.0);
        if i == 2 {
            ch.rotation = theta;
        }
        out.push((b.add(f, ch, cp), ["a", "b", "rot"][i]));
    }
    (b.build(), out)
}

/// wrap: envelope growth pushes card d to line 2 — or never does.
fn s_wrap(theta: f32) -> Built {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(SizeIntent::Fixed(380.0), SizeIntent::Auto, 10.0, 10.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    if let Payload::Frame { layout, .. } = &mut b.node_mut(f).payload {
        layout.wrap = true;
        layout.gap_cross = 10.0;
        layout.cross_align = CrossAlign::Start;
    }
    let mut out = vec![(f, "container")];
    for i in 0..4 {
        let (mut ch, cp) = card(70.0, 120.0);
        if i == 1 {
            ch.rotation = theta;
        }
        out.push((b.add(f, ch, cp), ["a", "rot", "c", "d"][i]));
    }
    (b.build(), out)
}

/// between: pinned ends, envelope eats the free space — or overlaps.
fn s_between(theta: f32) -> Built {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(SizeIntent::Fixed(460.0), SizeIntent::Fixed(170.0), 0.0, 10.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    if let Payload::Frame { layout, .. } = &mut b.node_mut(f).payload {
        layout.main_align = MainAlign::SpaceBetween;
    }
    let mut out = vec![(f, "container")];
    for i in 0..3 {
        let (mut ch, cp) = card(60.0, 100.0);
        if i == 1 {
            ch.rotation = theta;
        }
        out.push((b.add(f, ch, cp), ["a", "rot", "c"][i]));
    }
    (b.build(), out)
}

/// lens: the two-lane proof — header-rotate vs lens-rotate in ONE row.
/// In the anchor arm the header child makes room while the lens child
/// keeps CSS semantics; in the CSS arm both behave the same (overlap).
fn s_lens(theta: f32) -> Built {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(SizeIntent::Fixed(520.0), SizeIntent::Fixed(190.0), 10.0, 10.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut out = vec![(f, "container")];
    let (h1, p1) = card(60.0, 100.0);
    out.push((b.add(f, h1, p1), "a"));
    let (mut h2, p2) = card(60.0, 100.0);
    h2.rotation = theta;
    out.push((b.add(f, h2, p2), "header-rot"));
    let (h3, p3) = card(60.0, 100.0);
    out.push((b.add(f, h3, p3), "b"));
    let lens_h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    let l = b.add(
        f,
        lens_h,
        Payload::Lens {
            ops: vec![LensOp::Rotate { deg: theta }],
        },
    );
    let (ch, cp) = card(60.0, 100.0);
    // Emit the lens's CHILD, not the lens: the child's world composes
    // through the ops chain, so the paint-lane rotation is visible.
    let lc = b.add(l, ch, cp);
    out.push((lc, "lens-rot"));
    let (h4, p4) = card(60.0, 100.0);
    out.push((b.add(f, h4, p4), "c"));
    (b.build(), out)
}

// --- metrics ------------------------------------------------------------

/// Max pairwise world-AABB intersection among the measured siblings
/// (E1's overlap metric, generalized).
fn overlap_of(r: &Resolved, nodes: &[(NodeId, &str)]) -> f32 {
    let ids: Vec<NodeId> = nodes.iter().skip(1).map(|(id, _)| *id).collect();
    let mut worst = 0.0f32;
    for i in 0..ids.len() {
        for j in (i + 1)..ids.len() {
            let a = r.aabb_of(ids[i]);
            let b = r.aabb_of(ids[j]);
            worst = worst.max(a.intersection_area(&b));
        }
    }
    worst
}

/// Ink escape: how far (px) the siblings' ink runs past the container's
/// own painted rect. Containment truth = 0.
fn escape_of(r: &Resolved, nodes: &[(NodeId, &str)]) -> f32 {
    let (cid, _) = nodes[0];
    let cb = r.box_of(cid);
    let cw = r.world_of(cid);
    let crect = RectF {
        x: 0.0,
        y: 0.0,
        w: cb.w,
        h: cb.h,
    }
    .transformed_aabb(&cw);
    let mut esc = 0.0f32;
    for (id, _) in nodes.iter().skip(1) {
        let a = r.aabb_of(*id);
        esc = esc
            .max(crect.x - a.x)
            .max(a.x + a.w - (crect.x + crect.w))
            .max(crect.y - a.y)
            .max(a.y + a.h - (crect.y + crect.h));
    }
    esc.max(0.0)
}

// --- driver --------------------------------------------------------------

fn emit_arm(json: &mut String, arm: RotationInFlow, sc: &Scene) {
    let mut first = true;
    let mut frames = String::new();
    let mut metrics = String::new();
    let mut theta = 0.0f32;
    while theta <= MAX_T {
        let (doc, nodes) = (sc.build)(theta);
        let r = resolve(&doc, &opts(arm));
        if !first {
            frames.push(',');
            metrics.push(',');
        }
        first = false;
        frames.push('[');
        for (ni, (id, _)) in nodes.iter().enumerate() {
            if ni > 0 {
                frames.push(',');
            }
            let w = r.world_of(*id);
            let bx = r.box_of(*id);
            let _ = write!(
                frames,
                "[{:.2},{:.3},{:.3},{:.3},{:.2},{:.2},{:.2},{:.2}]",
                w.a, w.b, w.c, w.d, w.e, w.f, bx.w, bx.h
            );
        }
        frames.push(']');
        let cb = r.box_of(nodes[0].0);
        let _ = write!(
            metrics,
            "[{:.1},{:.1},{:.1},{:.1}]",
            overlap_of(&r, &nodes),
            cb.w,
            cb.h,
            escape_of(&r, &nodes)
        );
        theta += STEP;
    }
    let _ = write!(json, "{{\"frames\":[{frames}],\"m\":[{metrics}]}}");
}

fn main() {
    let scenes: Vec<Scene> = vec![
        Scene { id: "grow", name: "grow x rotation", build: s_grow },
        Scene { id: "stretch", name: "stretch x rotation", build: s_stretch },
        Scene { id: "text", name: "rotated text in a row", build: s_text },
        Scene { id: "hug", name: "hug containment", build: s_hug },
        Scene { id: "wrap", name: "wrap reflow", build: s_wrap },
        Scene { id: "between", name: "space-between", build: s_between },
        Scene { id: "lens", name: "two lanes in one row", build: s_lens },
    ];

    let mut json = String::from("{\"step\":3,\"scenes\":[");
    for (si, sc) in scenes.iter().enumerate() {
        if si > 0 {
            json.push(',');
        }
        let (_, nodes0) = (sc.build)(0.0);
        let labels: Vec<String> = nodes0.iter().map(|(_, l)| format!("\"{l}\"")).collect();
        let _ = write!(
            json,
            "{{\"id\":\"{}\",\"name\":\"{}\",\"labels\":[{}],\"anchor\":",
            sc.id,
            sc.name,
            labels.join(",")
        );
        emit_arm(&mut json, RotationInFlow::AabbParticipates, sc);
        json.push_str(",\"css\":");
        emit_arm(&mut json, RotationInFlow::VisualOnly, sc);
        json.push('}');
    }
    json.push_str("]}");
    fs::create_dir_all("../dec0-fork").unwrap();
    fs::write("../dec0-fork/fork.json", &json).unwrap();
    println!("wrote ../dec0-fork/fork.json ({} bytes)", json.len());
}
