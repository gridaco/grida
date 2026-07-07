//! D-* — derived boxes (groups, lens): the P6 instability fixes.

mod common;
use common::*;

use anchor_lab::model::*;
use anchor_lab::resolve::resolve;

fn rotated_group_doc() -> (Document, NodeId, NodeId, NodeId) {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(100.0);
    gh.y = AxisBinding::start(50.0);
    gh.rotation = 30.0;
    let g = b.add(0, gh, Payload::Group);
    let (s1h, s1p) = shape(40.0, 40.0);
    let s1 = b.add(g, s1h, s1p);
    let (mut s2h, s2p) = shape(40.0, 40.0);
    s2h.x = AxisBinding::start(56.0);
    let s2 = b.add(g, s2h, s2p);
    (b.build(), g, s1, s2)
}

/// D-1: group bounds = union of children's *oriented* corners.
#[test]
fn d1_union_of_oriented_corners() {
    let mut b = DocBuilder::new();
    let g = b.add(0, Header::new(SizeIntent::Auto, SizeIntent::Auto), Payload::Group);
    let (mut s1h, s1p) = shape(100.0, 20.0);
    s1h.rotation = 90.0; // oriented AABB: 20×100 about center (50,10)
    let s1 = b.add(g, s1h, s1p);
    let doc = b.build();
    let r = run(&doc);
    let _ = s1;
    // rotated about center (50,10): AABB x 40..60, y −40..60
    let u = r.box_of(g);
    assert_close(u.w, 20.0, "union w from oriented corners");
    assert_close(u.h, 100.0, "union h from oriented corners");
}

/// D-2: editing child A of a rotated group does not move child B in world
/// space — the P6 instability test.
#[test]
fn d2_sibling_stability_under_rotated_group() {
    let (doc, _, s1, s2) = rotated_group_doc();
    let r1 = run(&doc);
    let s2_world_before = r1.world_of(s2);
    let s2_corner_before = s2_world_before.apply((0.0, 0.0));

    // edit child A: move it (grows the union leftward/upward)
    let mut doc2 = doc.clone();
    doc2.get_mut(s1).header.x = AxisBinding::start(-30.0);
    doc2.get_mut(s1).header.y = AxisBinding::start(-10.0);
    let r2 = run(&doc2);
    let s2_corner_after = r2.world_of(s2).apply((0.0, 0.0));

    assert_close(s2_corner_before.0, s2_corner_after.0, "sibling B fixed x");
    assert_close(s2_corner_before.1, s2_corner_after.1, "sibling B fixed y");
}

/// D-3: child edits never require a write to the group node.
#[test]
fn d3_child_edit_writes_nothing_to_group() {
    let (doc, g, s1, _) = rotated_group_doc();
    let mut doc2 = doc.clone();
    doc2.get_mut(s1).header.x = AxisBinding::start(-30.0);
    // group node bytes identical
    assert_eq!(doc.get(g), doc2.get(g), "group untouched by child edit");
}

/// D-6 (declared): a group participates in parent flex via its derived
/// AABB (rotated per the E1 flag).
#[test]
fn d6_group_in_flex_participates_via_derived_aabb() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Fixed(200.0),
        Direction::Row,
        10.0,
        0.0,
    );
    let f = b.add(0, h, p);
    let (s0h, s0p) = shape(50.0, 50.0);
    let s0 = b.add(f, s0h, s0p);
    let g = b.add(f, Header::new(SizeIntent::Auto, SizeIntent::Auto), Payload::Group);
    let (g1h, g1p) = shape(30.0, 30.0);
    b.add(g, g1h, g1p);
    let (mut g2h, g2p) = shape(30.0, 30.0);
    g2h.x = AxisBinding::start(40.0);
    b.add(g, g2h, g2p);
    let (s3h, s3p) = shape(50.0, 50.0);
    let s3 = b.add(f, s3h, s3p);
    let doc = b.build();
    let r = run(&doc);
    let _ = s0;
    // group union = 70×30 → next sibling at 50+10+70+10
    assert_close(r.box_of(s3).x, 140.0, "sibling after group slot");
    assert_close(r.box_of(g).w, 70.0, "derived extent");
}

/// D-E1 (declared): empty group → zero bounds, resolves, renders nothing.
#[test]
fn de1_empty_group_zero_bounds() {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(10.0);
    let g = b.add(0, gh, Payload::Group);
    let doc = b.build();
    let r = run(&doc);
    assert_rect(r.box_of(g), 10.0, 0.0, 0.0, 0.0, "empty union at placement");
}

/// Lens: layout-transparent quarantine — ops affect paint (world of
/// children), never the box the parent lays out (a.md §3.3).
#[test]
fn lens_ops_are_layout_transparent() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Fixed(200.0),
        Direction::Row,
        10.0,
        0.0,
    );
    let f = b.add(0, h, p);
    let (s0h, s0p) = shape(50.0, 50.0);
    b.add(f, s0h, s0p);
    let lens = b.add(
        f,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens {
            ops: vec![LensOp::Skew {
                x_deg: 20.0,
                y_deg: 0.0,
            }],
        },
    );
    let (ch, cp) = shape(240.0, 150.0);
    let c = b.add(lens, ch, cp);
    let (s3h, s3p) = shape(50.0, 50.0);
    let s3 = b.add(f, s3h, s3p);
    let doc = b.build();
    let r = run(&doc);

    // parent flex sees the pre-ops box (240 wide), not the skewed envelope
    assert_close(r.box_of(lens).w, 240.0, "pre-ops box participates");
    assert_close(r.box_of(s3).x, 50.0 + 10.0 + 240.0 + 10.0, "sibling slot");
    // …but the child's world transform carries the skew
    let w = r.world_of(c);
    assert!((w.c - (20.0f32).to_radians().tan()).abs() < 1e-4, "skew in world");
    // and the render bounds (world AABB) are wider than the box
    assert!(r.aabb_of(lens).w > 240.0, "post-ops render bounds");
}

/// Both E1 modes agree on everything outside flow rotation (guard: the flag
/// touches exactly one semantic).
#[test]
fn flag_scope_is_limited_to_flow_rotation() {
    let (doc, g, s1, s2) = rotated_group_doc();
    let ra = resolve(&doc, &opts());
    let rv = resolve(&doc, &opts_visual());
    for id in [g, s1, s2] {
        assert_eq!(ra.world_of(id), rv.world_of(id), "free tree identical");
    }
}
