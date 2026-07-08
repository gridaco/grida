//! ENG-2.2 · damage is a data diff of two resolved tiers. Identical tiers
//! produce no damage; a single independent move damages exactly that node
//! (the locality the incremental resolver will exploit — OS-1a).

use anchor_engine::damage::diff;
use anchor_lab::model::*;
use anchor_lab::ops::{apply, Op};
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 1000.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    }
}

fn free_shape(x: f32, y: f32) -> (Header, Payload) {
    let mut h = Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(40.0));
    h.x = AxisBinding::start(x);
    h.y = AxisBinding::start(y);
    (
        h,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    )
}

/// root + two independent free shapes.
fn scene() -> (Document, NodeId, NodeId) {
    let mut b = DocBuilder::new();
    let (s1h, s1p) = free_shape(50.0, 50.0);
    let s1 = b.add(0, s1h, s1p);
    let (s2h, s2p) = free_shape(300.0, 300.0);
    let s2 = b.add(0, s2h, s2p);
    (b.build(), s1, s2)
}

#[test]
fn diff_of_identical_is_empty() {
    let (doc, ..) = scene();
    let r = resolve(&doc, &opts());
    let d = diff(&r, &r);
    assert!(d.is_empty());
    assert!(d.union_world.is_none());
}

#[test]
fn moving_one_node_damages_only_that_node() {
    let (mut doc, s1, s2) = scene();
    let prev = resolve(&doc, &opts());

    let r = resolve(&doc, &opts());
    apply(
        &mut doc,
        &r,
        &Op::SetX {
            id: s1,
            value: 800.0,
        },
    )
    .unwrap();
    let next = resolve(&doc, &opts());

    let d = diff(&prev, &next);
    assert_eq!(d.changed, vec![s1], "only the moved leaf is damaged");
    assert!(
        !d.changed.contains(&s2),
        "the independent sibling is untouched"
    );
    assert!(
        !d.changed.contains(&doc.root),
        "the fixed root is untouched"
    );
    // The damage rect covers the node's before and after ink.
    let dr = d.union_world.expect("moved node has ink");
    assert!(dr.w >= 40.0 && dr.h >= 40.0, "covers at least the node box");
}
