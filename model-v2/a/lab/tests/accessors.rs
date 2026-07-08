//! The non-panicking `Resolved` column reads (engine setup, step 2). The
//! damage differ and any consumer that walks all arena slots use these
//! instead of the `*_of` forms that assert resolution. Guards: they agree
//! with the panicking forms where resolved, and return `None` off the
//! resolved set (hidden subtree, out-of-range id).

mod common;

use anchor_lab::model::*;
use anchor_lab::resolve::resolve;
use common::opts_visual;

#[test]
fn opt_accessors_agree_with_panicking_forms() {
    let mut b = DocBuilder::new();
    let s = b.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(28.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let doc = b.build();
    let r = resolve(&doc, &opts_visual());

    assert_eq!(r.box_opt(s), Some(r.box_of(s)));
    assert_eq!(r.local_opt(s), Some(r.local_of(s)));
    assert_eq!(r.aabb_opt(s), Some(r.aabb_of(s)));
    assert_eq!(r.world_opt(s), Some(r.world_of(s)));
}

#[test]
fn slot_count_matches_arena_capacity() {
    let mut b = DocBuilder::new();
    b.add(
        0,
        Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let doc = b.build();
    let r = resolve(&doc, &opts_visual());
    assert_eq!(r.slot_count(), doc.capacity());
}

#[test]
fn hidden_and_out_of_range_read_none() {
    let mut b = DocBuilder::new();
    let mut h = Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0));
    h.active = false; // display:none — the resolver skips it, column stays None
    let hidden = b.add(
        0,
        h,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let doc = b.build();
    let r = resolve(&doc, &opts_visual());

    assert_eq!(r.box_opt(hidden), None);
    assert_eq!(r.local_opt(hidden), None);
    assert_eq!(r.aabb_opt(hidden), None);
    assert_eq!(r.world_opt(hidden), None);

    // Never-allocated id: `.get()` guards the index rather than panicking.
    let ghost: NodeId = 9999;
    assert_eq!(r.box_opt(ghost), None);
    assert_eq!(r.local_opt(ghost), None);
    assert_eq!(r.aabb_opt(ghost), None);
    assert_eq!(r.world_opt(ghost), None);
}
