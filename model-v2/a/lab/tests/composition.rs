//! Boxed-node composition: an internal Shape may own free-positioned children
//! while keeping its parametric box and layout contribution independent. Text
//! stays a leaf. Draft 0 exposes this as direct primitive composition such as
//! `<rect><text>`.

use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, ResolveOptions};

fn rect(w: f32, h: f32) -> (Header, Payload) {
    (
        Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    )
}

#[test]
fn shape_children_resolve_in_the_shape_local_box() {
    let mut builder = DocBuilder::new();
    let (mut shape_header, shape_payload) = rect(200.0, 100.0);
    shape_header.x = AxisBinding::start(100.0);
    shape_header.y = AxisBinding::start(50.0);
    let shape = builder.add(0, shape_header, shape_payload);

    let mut text_header = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    text_header.x = AxisBinding::start(10.0);
    text_header.y = AxisBinding::start(12.0);
    let text = builder.add(
        shape,
        text_header,
        Payload::Text {
            content: "content".into(),
            font_size: 10.0,
        },
    );

    let doc = builder.build();
    let resolved = resolve(&doc, &ResolveOptions::default());
    assert_eq!(resolved.xywh(shape), (100.0, 50.0, 200.0, 100.0));
    assert_eq!(resolved.box_of(text).x, 10.0);
    assert_eq!(resolved.box_of(text).y, 12.0);
    let world = resolved.world_of(text);
    assert_eq!((world.e, world.f), (110.0, 62.0));
}

/// Children are paint/content, not a second measurement input. Overflow may
/// enlarge read-tier ink bounds, but it cannot resize the Shape or move its
/// flex sibling.
#[test]
fn shape_children_do_not_feed_back_into_box_or_layout() {
    let mut builder = DocBuilder::new();
    let frame = builder.add(
        0,
        Header::new(SizeIntent::Fixed(300.0), SizeIntent::Fixed(100.0)),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                gap_main: 10.0,
                ..Default::default()
            },
            clips_content: false,
        },
    );

    let (shape_header, shape_payload) = rect(80.0, 60.0);
    let composed = builder.add(frame, shape_header, shape_payload);
    let mut overflow_header = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    overflow_header.x = AxisBinding::start(90.0);
    let overflow = builder.add(
        composed,
        overflow_header,
        Payload::Text {
            content: "overflow".into(),
            font_size: 10.0,
        },
    );
    let (sibling_header, sibling_payload) = rect(40.0, 40.0);
    let sibling = builder.add(frame, sibling_header, sibling_payload);

    let doc = builder.build();
    let resolved = resolve(&doc, &ResolveOptions::default());
    assert_eq!(resolved.box_of(composed).w, 80.0);
    assert_eq!(resolved.box_of(sibling).x, 90.0, "80px box + 10px gap");
    assert_eq!(resolved.box_of(overflow).x, 90.0);
    assert!(
        resolved.aabb_of(composed).w > resolved.box_of(composed).w,
        "read-tier ink still includes overflowing descendants"
    );
}

#[test]
fn payload_child_capabilities_are_explicit() {
    assert!(Payload::Shape {
        desc: ShapeDesc::Rect
    }
    .accepts_children());
    assert!(Payload::Frame {
        layout: LayoutBehavior::default(),
        clips_content: false,
    }
    .accepts_children());
    assert!(!Payload::Text {
        content: String::new(),
        font_size: 16.0,
    }
    .accepts_children());
}

#[test]
#[should_panic(expected = "text does not accept children")]
fn builder_rejects_text_children() {
    let mut builder = DocBuilder::new();
    let text = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Text {
            content: "leaf".into(),
            font_size: 16.0,
        },
    );
    let (child_header, child_payload) = rect(10.0, 10.0);
    builder.add(text, child_header, child_payload);
}

#[test]
#[should_panic(expected = "text does not accept children")]
fn splice_rejects_text_children() {
    let mut builder = DocBuilder::new();
    let text = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Text {
            content: "leaf".into(),
            font_size: 16.0,
        },
    );
    let (header, payload) = rect(10.0, 10.0);
    let child = builder.add(0, header, payload);
    let mut doc = builder.build();
    doc.splice_children(text, 0, 0, vec![child]);
}
