//! Edge-case sweep generator — rotation × layout intersections, resolved by
//! the real lab resolver and dumped as JSON frames for the edge-cases demo.
//!
//! Output: ../edge-cases/frames.json
//! Per scene, per frame (θ), per node: world affine (a,b,c,d,e,f) + box dims.

use anchor_lab::model::*;
use anchor_lab::ops::{self, Axis, ResizeDrag};
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};
use std::fmt::Write as _;
use std::fs;

const STEP: f32 = 3.0;
const MAX_T: f32 = 180.0;

struct Scene {
    id: &'static str,
    name: &'static str,
    build: fn(f32) -> (Document, Vec<(NodeId, &'static str)>),
    /// Raw JSON injected into the scene object (sweep relabel, outline set,
    /// direction markers) — empty for the plain rotation sweeps.
    extra: &'static str,
}

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 600.0),
        rotation_in_flow: RotationInFlow::AabbParticipates,
    }
}

fn frame_flex(
    w: SizeIntent,
    h: SizeIntent,
    dir: Direction,
    gap: f32,
    pad: f32,
) -> (Header, Payload) {
    (
        Header::new(w, h),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                direction: dir,
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

// --- scenes -----------------------------------------------------------

/// S1 — grow × rotation (E-A4): fixed row, middle card grow=1 rotating.
fn s_grow(theta: f32) -> (Document, Vec<(NodeId, &'static str)>) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Fixed(460.0),
        SizeIntent::Fixed(170.0),
        Direction::Row,
        10.0,
        10.0,
    );
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

/// S2 — stretch × rotation: middle card align=stretch while rotating.
fn s_stretch(theta: f32) -> (Document, Vec<(NodeId, &'static str)>) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Fixed(460.0),
        SizeIntent::Fixed(190.0),
        Direction::Row,
        10.0,
        10.0,
    );
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

/// S3 — rotated text in flow: measure unrotated, AABB participates.
fn s_text(theta: f32) -> (Document, Vec<(NodeId, &'static str)>) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Fixed(170.0),
        Direction::Row,
        10.0,
        10.0,
    );
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
            content: "hello".into(),
            font_size: 18.0,
        },
    );
    out.push((t, "text+rot"));
    let (h2, p2) = card(60.0, 100.0);
    out.push((b.add(f, h2, p2), "c"));
    (b.build(), out)
}

/// S4 — a whole flex frame rotated: layout runs in the frame's local
/// space; the assembly is rigid.
fn s_rotated_frame(theta: f32) -> (Document, Vec<(NodeId, &'static str)>) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Fixed(320.0),
        SizeIntent::Fixed(120.0),
        Direction::Row,
        10.0,
        10.0,
    );
    let mut fh = at(fh, 90.0, 60.0);
    fh.rotation = theta;
    let f = b.add(0, fh, fp);
    let mut out = vec![(f, "flex frame (rotated)")];
    for i in 0..3 {
        let (mut ch, cp) = card(80.0, 90.0);
        if i == 1 {
            ch.grow = 1.0;
        }
        out.push((b.add(f, ch, cp), ["a", "grow", "c"][i]));
    }
    (b.build(), out)
}

/// S5 — group (derived box) rotating in flow.
fn s_group(theta: f32) -> (Document, Vec<(NodeId, &'static str)>) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Fixed(190.0),
        Direction::Row,
        10.0,
        10.0,
    );
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut out = vec![(f, "container")];
    let (h1, p1) = card(60.0, 100.0);
    out.push((b.add(f, h1, p1), "a"));
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.rotation = theta;
    let g = b.add(f, gh, Payload::Group);
    let (c1h, c1p) = card(50.0, 50.0);
    let ga = b.add(g, c1h, c1p);
    let (mut c2h, c2p) = card(50.0, 50.0);
    c2h.x = AxisBinding::start(30.0);
    c2h.y = AxisBinding::start(40.0);
    let gb = b.add(g, c2h, c2p);
    out.push((ga, "group.a"));
    out.push((gb, "group.b"));
    let (h2, p2) = card(60.0, 100.0);
    out.push((b.add(f, h2, p2), "c"));
    (b.build(), out)
}

/// S6 — two siblings rotating together (compound envelopes).
fn s_two(theta: f32) -> (Document, Vec<(NodeId, &'static str)>) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Fixed(190.0),
        Direction::Row,
        10.0,
        10.0,
    );
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut out = vec![(f, "container")];
    for i in 0..3 {
        let (mut ch, cp) = card(60.0, 100.0);
        if i != 1 {
            ch.rotation = if i == 0 { theta } else { -theta };
        }
        out.push((b.add(f, ch, cp), ["rot", "still", "rot(-)"][i]));
    }
    (b.build(), out)
}

/// S7 — space-between with a rotating middle child.
fn s_between(theta: f32) -> (Document, Vec<(NodeId, &'static str)>) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Fixed(460.0),
        SizeIntent::Fixed(170.0),
        Direction::Row,
        0.0,
        10.0,
    );
    let mut fh = at(fh, 20.0, 20.0);
    if let Payload::Frame { layout, .. } = &mut b.node_mut(0).payload {
        let _ = layout;
    }
    let f = b.add(0, fh, fp);
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

/// S8 — wrapping row: the envelope growth reflows a card to line 2.
fn s_wrap(theta: f32) -> (Document, Vec<(NodeId, &'static str)>) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Fixed(380.0),
        SizeIntent::Auto,
        Direction::Row,
        10.0,
        10.0,
    );
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

/// S9 — cross-zero resize (open decision D-9): three policies side by side.
/// The sweep variable is the DRAG HANDLE offset from the fixed edge (px),
/// not an angle: v = 80 − t·(160/180) ∈ [+80 … −80]; anchor at local 95.
/// Arm A = the wall (extent clamps at 0); arm B = slide (rect tracks the
/// hand, content never mirrors); arm C = the real `resize_drag` op
/// (re-target: |extent| + flip toggle + re-pin — Figma-parity class).
fn s_flipzero(t: f32) -> (Document, Vec<(NodeId, &'static str)>) {
    let v = 60.0 - t * (120.0 / 180.0);
    let anchor = 75.0;
    let target = anchor + v;

    let mut b = DocBuilder::new();
    let mut arm = |b: &mut DocBuilder, x: f32| -> NodeId {
        let mut h = Header::new(SizeIntent::Fixed(145.0), SizeIntent::Fixed(140.0));
        h.x = AxisBinding::start(x);
        h.y = AxisBinding::start(30.0);
        b.add(
            0,
            h,
            Payload::Frame {
                layout: LayoutBehavior::default(),
                clips_content: false,
            },
        )
    };
    let rect_at = |x: f32, w: f32| -> (Header, Payload) {
        let (mut h, p) = card(w, 70.0);
        h.x = AxisBinding::start(x);
        h.y = AxisBinding::start(35.0);
        (h, p)
    };

    // A — the wall: the pre-decision model rejects past zero.
    let fa = arm(&mut b, 20.0);
    let (h1, p1) = rect_at(anchor, v.max(0.0));
    let ra = b.add(fa, h1, p1);
    // B — slide: |extent| + re-pin, no mirror.
    let fb = arm(&mut b, 175.0);
    let (h2, p2) = rect_at(target.min(anchor), v.abs());
    let rb = b.add(fb, h2, p2);
    // C — flip: built at rest, then driven by the REAL gesture op.
    let fc = arm(&mut b, 330.0);
    let (h3, p3) = rect_at(anchor, 60.0);
    let rc = b.add(fc, h3, p3);

    let mut doc = b.build();
    let r = resolve(&doc, &opts());
    let drag = ResizeDrag::begin(&doc, &r, rc, Axis::X, AnchorEdge::Start).unwrap();
    ops::resize_drag(&mut doc, &r, rc, &drag, target).unwrap();

    (
        doc,
        vec![
            (fa, "wall"),
            (ra, "R"),
            (fb, "slide"),
            (rb, "R"),
            (fc, "flip"),
            (rc, "R"),
        ],
    )
}

// --- driver -----------------------------------------------------------

fn main() {
    let scenes: Vec<Scene> = vec![
        Scene { id: "grow", name: "grow × rotation (E-A4)", build: s_grow, extra: "" },
        Scene { id: "stretch", name: "stretch × rotation", build: s_stretch, extra: "" },
        Scene { id: "text", name: "rotated text in flow", build: s_text, extra: "" },
        Scene { id: "rotframe", name: "rotated flex frame (rigid)", build: s_rotated_frame, extra: "" },
        Scene { id: "group", name: "group rotating in flow", build: s_group, extra: "" },
        Scene { id: "two", name: "two rotating siblings", build: s_two, extra: "" },
        Scene { id: "between", name: "space-between × rotation", build: s_between, extra: "" },
        Scene { id: "wrap", name: "wrap reflow mid-rotation", build: s_wrap, extra: "" },
        Scene {
            id: "flipzero",
            name: "resize across zero (flip)",
            build: s_flipzero,
            extra: r#","outlines":[0,2,4],"marker":true,"sweep":{"label":"drag","from":60,"to":-60,"unit":"px"}"#,
        },
    ];

    let mut json = String::from("{\"step\":3,\"scenes\":[");
    for (si, sc) in scenes.iter().enumerate() {
        if si > 0 {
            json.push(',');
        }
        // node labels from θ=0 build
        let (_, nodes0) = (sc.build)(0.0);
        let labels: Vec<String> = nodes0
            .iter()
            .map(|(_, l)| format!("\"{}\"", l))
            .collect();
        let _ = write!(
            json,
            "{{\"id\":\"{}\",\"name\":\"{}\",\"labels\":[{}]{},\"frames\":[",
            sc.id,
            sc.name,
            labels.join(","),
            sc.extra
        );
        let mut theta = 0.0f32;
        let mut first = true;
        while theta <= MAX_T {
            let (doc, nodes) = (sc.build)(theta);
            let r = resolve(&doc, &opts());
            if !first {
                json.push(',');
            }
            first = false;
            json.push('[');
            for (ni, (id, _)) in nodes.iter().enumerate() {
                if ni > 0 {
                    json.push(',');
                }
                let w = r.world_of(*id);
                let bx = r.box_of(*id);
                let _ = write!(
                    json,
                    "[{:.2},{:.3},{:.3},{:.3},{:.3},{:.2},{:.2},{:.2},{:.2}]",
                    w.a, w.b, w.c, w.d, w.e, w.f, bx.w, bx.h, 0.0
                );
            }
            json.push(']');
            theta += STEP;
        }
        let _ = write!(json, "]}}");
    }
    json.push_str("]}");
    fs::create_dir_all("../edge-cases").unwrap();
    fs::write("../edge-cases/frames.json", &json).unwrap();
    println!("wrote ../edge-cases/frames.json ({} bytes)", json.len());
}
