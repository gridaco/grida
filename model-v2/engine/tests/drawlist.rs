//! ENG-2.1 · the drawlist is a pure, deterministic projection. These data
//! tests guard ordering, balanced scopes, pruning, authored paint transfer,
//! and verbatim resolver transforms.

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
        ItemKind::BeginOpacity { .. } => "opacity-begin",
        ItemKind::EndOpacity => "opacity-end",
        ItemKind::BeginClipRect { .. } => "clip-begin",
        ItemKind::EndClip => "clip-end",
        ItemKind::RectFill { .. } => "rectfill",
        ItemKind::RectStroke { .. } => "rectstroke",
        ItemKind::OvalFill { .. } => "ovalfill",
        ItemKind::OvalStroke { .. } => "ovalstroke",
        ItemKind::LineStroke { .. } => "linestroke",
        ItemKind::TextFill { .. } => "textfill",
        ItemKind::TextStroke { .. } => "textstroke",
    }
}

fn solid_stroke(color: Color, width: f32, align: StrokeAlign) -> Stroke {
    Stroke {
        paints: Paints::solid(color),
        width,
        align,
        cap: StrokeCap::Butt,
        join: StrokeJoin::Miter,
        miter_limit: 4.0,
        dash_array: None,
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
    let ellipse = b.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(40.0)),
        Payload::Shape {
            desc: ShapeDesc::Ellipse,
        },
    );
    let line = b.add(
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
    let group_child = b.add(
        g,
        Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(20.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let text = b.add(
        0,
        Header::new(SizeIntent::Fixed(80.0), SizeIntent::Fixed(20.0)),
        Payload::Text {
            content: "hi".to_string(),
            font_size: 16.0,
        },
    );
    let mut hidden_h = Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0));
    hidden_h.active = false;
    let hidden = b.add(
        0,
        hidden_h,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );

    let mut doc = b.build();
    doc.get_mut(f).fills = Paints::solid("#ff0000".into());
    for id in [r, ellipse, group_child, hidden] {
        doc.get_mut(id).fills = Paints::solid("#4A90D9".into());
    }
    doc.get_mut(f).strokes = vec![solid_stroke("#C9CED4".into(), 1.0, StrokeAlign::Inside)];
    doc.get_mut(line).strokes = vec![solid_stroke("#4A90D9".into(), 2.0, StrokeAlign::Center)];
    doc.get_mut(text).fills = Paints::solid(Color::BLACK);
    (doc, f, r)
}

#[test]
fn traversal_order_and_pruning() {
    let (doc, _f, _r) = scene();
    let resolved = resolve(&doc, &opts());
    let list = build(&doc, &resolved);

    let tags: Vec<&str> = list.items.iter().map(|it| tag(&it.kind)).collect();
    // frame(fill,stroke), rect, ellipse, line stroke, group-child rect, text;
    // root & group emit no ink, hidden shape is pruned.
    assert_eq!(
        tags,
        [
            "rectfill",
            "rectstroke",
            "rectfill",
            "ovalfill",
            "linestroke",
            "rectfill",
            "textfill"
        ]
    );
}

#[test]
fn paint_stacks_materialize_without_kind_fallbacks() {
    let (doc, _f, _r) = scene();
    let resolved = resolve(&doc, &opts());
    let list = build(&doc, &resolved);

    // Frame fill = the node's #ff0000, opaque.
    let ItemKind::RectFill { ref paints, .. } = list.items[0].kind else {
        panic!("expected frame fill first");
    };
    assert_eq!(*paints, Paints::solid("#FF0000".into()));

    // Frame stroke = only the authored stack; there is no engine fallback.
    let ItemKind::RectStroke { ref stroke, .. } = list.items[1].kind else {
        panic!("expected frame stroke second");
    };
    assert_eq!(stroke.paints, Paints::solid("#C9CED4".into()));

    // The rect carries the concrete stack authored by the scene builder.
    let ItemKind::RectFill { ref paints, .. } = list.items[2].kind else {
        panic!("expected rect fill third");
    };
    assert_eq!(*paints, Paints::solid("#4A90D9".into()));
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

#[test]
fn fill_children_and_strokes_are_wrapped_by_balanced_scopes() {
    let mut b = DocBuilder::new();
    let mut parent_header = Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(80.0));
    parent_header.opacity = 0.5;
    let parent = b.add(
        0,
        parent_header,
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: true,
        },
    );
    let child = b.add(
        parent,
        Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(20.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let mut doc = b.build();
    doc.get_mut(parent).fills = Paints::solid("#FF0000".into());
    doc.get_mut(parent).strokes = vec![solid_stroke("#0000FF".into(), 4.0, StrokeAlign::Outside)];
    doc.get_mut(child).fills = Paints::solid("#00FF00".into());

    let resolved = resolve(&doc, &opts());
    let list = build(&doc, &resolved);
    assert_eq!(
        list.items
            .iter()
            .map(|item| tag(&item.kind))
            .collect::<Vec<_>>(),
        [
            "opacity-begin",
            "rectfill",
            "clip-begin",
            "rectfill",
            "clip-end",
            "rectstroke",
            "opacity-end",
        ]
    );
    assert!(list
        .items
        .iter()
        .all(|item| { !matches!(&item.kind, ItemKind::RectStroke { .. }) || item.node == parent }));
}

#[test]
fn repeated_strokes_keep_geometry_and_paint_order() {
    let mut b = DocBuilder::new();
    let rect = b.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(30.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let mut doc = b.build();
    let mut lower = solid_stroke("#FF0000".into(), 8.0, StrokeAlign::Outside);
    lower
        .paints
        .push(Paint::Solid(SolidPaint::new("#00FF00".into())));
    let upper = solid_stroke("#0000FF".into(), 2.0, StrokeAlign::Inside);
    doc.get_mut(rect).strokes = vec![lower.clone(), upper.clone()];

    let resolved = resolve(&doc, &opts());
    let list = build(&doc, &resolved);
    let strokes = list
        .items
        .iter()
        .filter_map(|item| match &item.kind {
            ItemKind::RectStroke { stroke, .. } => Some(stroke),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(strokes, [&lower, &upper]);
    assert_eq!(strokes[0].paints.len(), 2);
}

#[test]
fn frame_and_line_have_no_implicit_ink() {
    let mut b = DocBuilder::new();
    b.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(40.0)),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    let line = b.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(0.0)),
        Payload::Shape {
            desc: ShapeDesc::Line,
        },
    );
    let mut doc = b.build();
    // Even a programmatic compatibility fill does not become line ink.
    doc.get_mut(line).fills = Paints::solid("#FF0000".into());
    let resolved = resolve(&doc, &opts());
    assert!(build(&doc, &resolved).items.is_empty());
}

#[test]
fn ineffective_strokes_emit_no_item_and_visible_paints_keep_order() {
    let mut b = DocBuilder::new();
    let rect = b.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(30.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let mut doc = b.build();
    let zero_width = solid_stroke("#FF0000".into(), 0.0, StrokeAlign::Inside);
    let mut empty = solid_stroke("#FF0000".into(), 3.0, StrokeAlign::Inside);
    empty.paints = Paints::default();
    let mut inactive = SolidPaint::new("#00FF00".into());
    inactive.active = false;
    let mut visible = solid_stroke("#0000FF".into(), 2.0, StrokeAlign::Inside);
    visible.paints = Paints::new([
        Paint::Solid(inactive),
        Paint::Solid(SolidPaint::new("#0000FF".into())),
    ]);
    doc.get_mut(rect).strokes = vec![zero_width, empty, visible];

    let resolved = resolve(&doc, &opts());
    let list = build(&doc, &resolved);
    let [item] = list.items.as_slice() else {
        panic!("exactly one effective stroke should materialize");
    };
    let ItemKind::RectStroke { stroke, .. } = &item.kind else {
        panic!("effective rect stroke");
    };
    assert_eq!(stroke.paints, Paints::solid("#0000FF".into()));
}
