//! ENG-2.1 · the drawlist is a pure, deterministic projection whose
//! traversal and item vocabulary reproduce the spike painter exactly. This
//! guards the LOGIC (order, pruning, derived/root skip, color resolution,
//! verbatim world); pixel identity on the real starter scene is proven in
//! the spike A/B (step 6).

use anchor_engine::drawlist::{build, ItemKind};
use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 1000.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    }
}

fn tag(k: &ItemKind) -> &'static str {
    match k {
        ItemKind::RectFill { .. } => "rectfill",
        ItemKind::RectStroke { .. } => "rectstroke",
        ItemKind::Oval { .. } => "oval",
        ItemKind::Line { .. } => "line",
        ItemKind::TextRun { .. } => "text",
    }
}

/// root with: a red frame, rect, ellipse, line, a group (of one rect),
/// text, and a hidden shape. Returns (doc, frame_id, rect_id).
fn scene() -> (Document, NodeId, NodeId) {
    let mut b = DocBuilder::new();
    let f = b.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(60.0)),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    let r = b.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(40.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    b.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(40.0)),
        Payload::Shape {
            desc: ShapeDesc::Ellipse,
        },
    );
    b.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(2.0)),
        Payload::Shape {
            desc: ShapeDesc::Line,
        },
    );
    let g = b.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Group,
    );
    b.add(
        g,
        Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(20.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    b.add(
        0,
        Header::new(SizeIntent::Fixed(80.0), SizeIntent::Fixed(20.0)),
        Payload::Text {
            content: "hi".to_string(),
            font_size: 16.0,
        },
    );
    let mut hidden_h = Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0));
    hidden_h.active = false;
    b.add(
        0,
        hidden_h,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );

    let mut doc = b.build();
    doc.get_mut(f).fill = Some("ff0000".to_string());
    (doc, f, r)
}

#[test]
fn traversal_order_and_pruning() {
    let (doc, _f, _r) = scene();
    let resolved = resolve(&doc, &opts());
    let list = build(&doc, &resolved);

    let tags: Vec<&str> = list.items.iter().map(|it| tag(&it.kind)).collect();
    // frame(fill,stroke), rect, ellipse, line, group-child rect, text;
    // root & group emit no ink, hidden shape is pruned.
    assert_eq!(
        tags,
        [
            "rectfill",
            "rectstroke",
            "rectfill",
            "oval",
            "line",
            "rectfill",
            "text"
        ]
    );
}

#[test]
fn colors_resolve_like_the_painter() {
    let (doc, _f, _r) = scene();
    let resolved = resolve(&doc, &opts());
    let list = build(&doc, &resolved);

    // Frame fill = the node's #ff0000, opaque.
    let ItemKind::RectFill { argb, .. } = list.items[0].kind else {
        panic!("expected frame fill first");
    };
    assert_eq!(argb, 0xFFFF_0000);

    // Frame stroke = the fixed chrome color.
    let ItemKind::RectStroke { argb, .. } = list.items[1].kind else {
        panic!("expected frame stroke second");
    };
    assert_eq!(argb, 0xFFC9_CED4);

    // The bare rect (no fill set) = the shape default.
    let ItemKind::RectFill { argb, .. } = list.items[2].kind else {
        panic!("expected rect fill third");
    };
    assert_eq!(argb, 0xFF4A_90D9);
}

#[test]
fn world_is_copied_verbatim_not_recomputed() {
    let (doc, f, _r) = scene();
    let resolved = resolve(&doc, &opts());
    let list = build(&doc, &resolved);
    // The frame's item carries the resolver's world transform unchanged.
    assert_eq!(list.items[0].world, resolved.world_of(f));
}

#[test]
fn build_is_deterministic() {
    let (doc, _f, _r) = scene();
    let resolved = resolve(&doc, &opts());
    assert_eq!(build(&doc, &resolved), build(&doc, &resolved));
}
