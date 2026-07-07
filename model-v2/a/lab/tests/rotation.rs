//! R-* — rotation & transform semantics, including the E1 FORK row (R-3).

mod common;
use common::*;

use anchor_lab::math::{rotated_aabb_size, Affine};
use anchor_lab::model::*;
use anchor_lab::resolve::resolve;

/// R-1 (locked POL): rotating a boxed node preserves its box center.
#[test]
fn r1_center_pivot_preserves_center() {
    let mut b = DocBuilder::new();
    let (mut h, p) = shape(120.0, 80.0);
    h.x = AxisBinding::start(10.0);
    h.y = AxisBinding::start(20.0);
    let s = b.add(0, h, p);
    let mut doc = b.build();

    let r0 = run(&doc);
    let c0 = r0.world_of(s).apply((60.0, 40.0));

    for deg in [15.0, 90.0, 213.0, -45.0] {
        doc.get_mut(s).header.rotation = deg;
        let r = run(&doc);
        let c = r.world_of(s).apply((60.0, 40.0));
        assert_close(c.0, c0.0, "center x invariant");
        assert_close(c.1, c0.1, "center y invariant");
    }
}

/// R-2: world AABB is the exact |w·cosθ|+|h·sinθ| envelope.
#[test]
fn r2_world_aabb_is_exact_envelope() {
    let mut b = DocBuilder::new();
    let (mut h, p) = shape(120.0, 80.0);
    h.rotation = 37.0;
    let s = b.add(0, h, p);
    let doc = b.build();
    let r = run(&doc);
    let aabb = r.aabb_of(s);
    let (we, he) = rotated_aabb_size(120.0, 80.0, 37.0);
    assert_close(aabb.w, we, "aabb w");
    assert_close(aabb.h, he, "aabb h");
}

/// R-4: resize-then-rotate ≡ rotate-then-resize under the center pivot,
/// compared on the box (position + extent), which is what the document
/// stores. (World transforms differ by construction: the pivot moves with
/// the box center.)
#[test]
fn r4_rotation_resize_commute_on_box() {
    let build = |order: bool| {
        let mut b = DocBuilder::new();
        let (mut h, p) = shape(120.0, 80.0);
        h.x = AxisBinding::start(10.0);
        h.y = AxisBinding::start(20.0);
        let s = b.add(0, h, p);
        let mut doc = b.build();
        if order {
            doc.get_mut(s).header.rotation = 30.0;
            doc.get_mut(s).header.width = SizeIntent::Fixed(200.0);
        } else {
            doc.get_mut(s).header.width = SizeIntent::Fixed(200.0);
            doc.get_mut(s).header.rotation = 30.0;
        }
        (doc, s)
    };
    let (d1, s1) = build(true);
    let (d2, s2) = build(false);
    assert_eq!(run(&d1).box_of(s1), run(&d2).box_of(s2));
    assert_eq!(run(&d1).world_of(s1), run(&d2).world_of(s2));
}

/// R-5: 50-deep rotated nesting matches closed-form composition within N-3.
#[test]
fn r5_deep_nesting_matches_closed_form() {
    let mut b = DocBuilder::new();
    let mut parent = 0;
    let deg = 3.0f32;
    for _ in 0..50 {
        let (mut h, p) = frame_free(SizeIntent::Fixed(200.0), SizeIntent::Fixed(200.0));
        h.x = AxisBinding::start(5.0);
        h.y = AxisBinding::start(4.0);
        h.rotation = deg;
        parent = b.add(parent, h, p);
    }
    let doc = b.build();
    let r = run(&doc);

    // closed form: fold the same local transforms
    let mut expect = Affine::IDENTITY;
    for _ in 0..50 {
        expect = expect.then(&Affine::from_box_center(5.0, 4.0, 200.0, 200.0, deg));
    }
    let got = r.world_of(parent);
    // 50 compositions: allow a looser (but still tight) bound
    for (g, e) in [
        (got.a, expect.a),
        (got.b, expect.b),
        (got.c, expect.c),
        (got.d, expect.d),
        (got.e, expect.e),
        (got.f, expect.f),
    ] {
        assert!((g - e).abs() < 1e-2, "closed form: {g} vs {e}");
    }
}

/// R-3 — THE fork row, both arms, locked per mode (E1 executable form).
///
/// Portrait cards (60×100) in a row; the middle one rotated 90° so its
/// AABB (100×60) is *wider* than its box — the case where the two
/// semantics visibly diverge.
#[test]
fn r3_rotation_in_flow_fork_both_arms() {
    let mut b = DocBuilder::new();
    let f = {
        let (h, p) = frame_flex(
            SizeIntent::Auto,
            SizeIntent::Fixed(140.0),
            Direction::Row,
            10.0,
            10.0,
        );
        b.add(0, h, p)
    };
    let mut cards = vec![];
    for _ in 0..3 {
        let (h, p) = shape(60.0, 100.0);
        cards.push(b.add(f, h, p));
    }
    let mut doc = b.build();
    doc.get_mut(cards[1]).header.rotation = 90.0;

    // anchor arm: middle slot = rotated AABB (100 wide); siblings make room
    let ra = resolve(&doc, &opts());
    assert_close(ra.box_of(cards[2]).x, 190.0, "third card after AABB slot"); // 10+60+10+100+10
    assert_close(ra.box_of(f).w, 260.0, "hug = pad+60+gap+100+gap+60+pad");
    // box center := slot center (slot 80..180 → center 130; box 100..160… box w=60)
    assert_close(ra.box_of(cards[1]).x, 100.0, "box centered in slot");
    let o = ra
        .aabb_of(cards[0])
        .intersection_area(&ra.aabb_of(cards[1]));
    assert_close(o, 0.0, "no overlap (anchor arm)");

    // sheet arm (VisualOnly): layout unchanged by rotation → overlap is correct
    let rv = resolve(&doc, &opts_visual());
    assert_close(rv.box_of(f).w, 220.0, "container ignores rotation");
    assert_close(rv.box_of(cards[2]).x, 150.0, "siblings don't move");
    let ov = rv
        .aabb_of(cards[0])
        .intersection_area(&rv.aabb_of(cards[1]));
    assert_close(ov, 600.0, "overlap exists and is exact (visual-only arm)");
}

/// R-E1: quadrant angles produce bit-clean matrices end-to-end.
#[test]
fn re1_quadrant_angles_bit_clean() {
    let mut b = DocBuilder::new();
    let (mut h, p) = shape(100.0, 50.0);
    h.rotation = 90.0;
    let s = b.add(0, h, p);
    let doc = b.build();
    let w = run(&doc).world_of(s);
    assert_eq!(w.a, 0.0);
    assert_eq!(w.b, 1.0);
    assert_eq!(w.c, -1.0);
    assert_eq!(w.d, 0.0);
}

/// Derived-box pivot (§5): a group rotates about the point its bindings
/// place, and the center-feel gesture compensates in exactly 3 writes.
#[test]
fn group_origin_pivot_and_center_feel_gesture() {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(100.0);
    gh.y = AxisBinding::start(50.0);
    let g = b.add(0, gh, Payload::Group);
    let (s1h, s1p) = shape(40.0, 40.0);
    b.add(g, s1h, s1p);
    let (mut s2h, s2p) = shape(40.0, 40.0);
    s2h.x = AxisBinding::start(56.0);
    b.add(g, s2h, s2p);
    let mut doc = b.build();

    let r0 = run(&doc);
    let b0 = r0.box_of(g);
    assert_rect(b0, 100.0, 50.0, 96.0, 40.0, "union box");
    // origin pivot: bindings-placed point is fixed under raw rotation write
    doc.get_mut(g).header.rotation = 30.0;
    let r1 = run(&doc);
    let origin_before = r0.world_of(g).apply((0.0, 0.0));
    let origin_after = r1.world_of(g).apply((0.0, 0.0));
    assert_close(origin_before.0, origin_after.0, "pivot x fixed");
    assert_close(origin_before.1, origin_after.1, "pivot y fixed");

    // center-feel gesture: 3 writes, union center fixed in parent space
    doc.get_mut(g).header.rotation = 0.0;
    let r2 = run(&doc);
    let center_before = (b0.x + b0.w / 2.0, b0.y + b0.h / 2.0);
    let writes =
        anchor_lab::ops::rotate_derived_center_feel(&mut doc, &r2, g, 30.0).unwrap();
    assert_eq!(writes, 3, "rotation + x + y — the Figma trick over scalars");
    let r3 = run(&doc);
    let bb = r3.box_of(g);
    let local_center = (bb.w / 2.0, bb.h / 2.0);
    let center_after = r3.world_of(g).apply(local_center);
    assert_close(center_after.0, center_before.0, "center x fixed");
    assert_close(center_after.1, center_before.1, "center y fixed");
}
