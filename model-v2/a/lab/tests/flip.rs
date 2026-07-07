//! Flip conformance — E-A2 semantics + B1 pivot rule + the cross-zero
//! resize gesture (owner-raised red flag, 2026-07-07).
//!
//! Laws under test:
//! - F-1: flip on boxed kinds is center-applied → AABB-invariant →
//!   layout-invisible (the one transform that never pops layout).
//! - F-2: flip composes innermost (T·R·F): a flipped node's local equals
//!   the unflipped local pre-composed with the center mirror.
//! - F-3 (B1): flip pivot per kind follows rotation — origin for derived;
//!   D-2 sibling stability holds under a flipped group.
//! - F-4: cross-zero drag re-targets (|extent| + flip toggle + re-pin),
//!   tracks the gesture, and is an identity when dragged out and back.
//! - F-5: the typed write stays a wall — set_width(−x) = NegativeExtent,
//!   document untouched (M-6).
//! - F-6: ungroup bakes flips exactly (σ conjugation): world transforms
//!   of children are preserved.

use anchor_lab::math::Affine;
use anchor_lab::model::*;
use anchor_lab::ops;
use anchor_lab::ops::{Axis, OpError, ResizeDrag};
use anchor_lab::resolve::{resolve, ResolveOptions};

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 800.0),
        ..Default::default()
    }
}

fn approx(a: f32, b: f32, eps: f32) -> bool {
    (a - b).abs() <= eps
}

fn affine_approx(a: &Affine, b: &Affine, eps: f32) -> bool {
    approx(a.a, b.a, eps)
        && approx(a.b, b.b, eps)
        && approx(a.c, b.c, eps)
        && approx(a.d, b.d, eps)
        && approx(a.e, b.e, eps)
        && approx(a.f, b.f, eps)
}

fn card(w: f32, h: f32) -> (Header, Payload) {
    (
        Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    )
}

fn flex_row(w: f32, h: f32) -> (Header, Payload) {
    (
        Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h)),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                gap_main: 10.0,
                padding: EdgeInsets::all(10.0),
                cross_align: CrossAlign::Center,
                ..Default::default()
            },
            clips_content: false,
        },
    )
}

fn at(mut h: Header, x: f32, y: f32) -> Header {
    h.x = AxisBinding::start(x);
    h.y = AxisBinding::start(y);
    h
}

// --- F-1: layout invisibility ------------------------------------------

#[test]
fn f1_flip_is_layout_invisible_in_flow() {
    let build = |flip: bool| {
        let mut b = DocBuilder::new();
        let (fh, fp) = flex_row(460.0, 170.0);
        let f = b.add(0, at(fh, 20.0, 20.0), fp);
        let mut ids = vec![];
        for i in 0..3 {
            let (mut ch, cp) = card(60.0, 100.0);
            if i == 1 && flip {
                ch.flip_x = true;
                ch.flip_y = true;
            }
            ids.push(b.add(f, ch, cp));
        }
        (b.build(), ids)
    };
    let (d0, ids0) = build(false);
    let (d1, ids1) = build(true);
    let r0 = resolve(&d0, &opts());
    let r1 = resolve(&d1, &opts());
    for (a, b) in ids0.iter().zip(ids1.iter()) {
        // Boxes identical: flip is center-applied, the AABB cannot change.
        assert_eq!(r0.box_of(*a), r1.box_of(*b));
        let wa = r0.aabb_of(*a);
        let wb = r1.aabb_of(*b);
        assert!(approx(wa.x, wb.x, 1e-4) && approx(wa.w, wb.w, 1e-4));
    }
    // ...and the flipped node's world really mirrors (det < 0 is only
    // possible with an even/odd flip count — here x·y = det positive again,
    // so check the axes swapped sign instead).
    let w = r1.world_of(ids1[1]);
    assert!(w.a < 0.0 && w.d < 0.0, "both axes mirrored: {w:?}");
}

// --- F-2: composition order --------------------------------------------

#[test]
fn f2_flip_composes_innermost_about_center() {
    let (w, h, theta) = (100.0f32, 60.0f32, 30.0f32);
    let base = Affine::from_box_center(10.0, 20.0, w, h, theta);
    let flipped = Affine::from_box_center_flip(10.0, 20.0, w, h, theta, true, false);
    // T·R·F_c means: flipped(p) == base(mirror_c(p)).
    for p in [(0.0, 0.0), (w, 0.0), (30.0, 45.0), (w / 2.0, h / 2.0)] {
        let mirrored = (w - p.0, p.1);
        let lhs = flipped.apply(p);
        let rhs = base.apply(mirrored);
        assert!(
            approx(lhs.0, rhs.0, 1e-3) && approx(lhs.1, rhs.1, 1e-3),
            "p={p:?} lhs={lhs:?} rhs={rhs:?}"
        );
    }
    // Center is a fixed point of the mirror.
    let c = flipped.apply((w / 2.0, h / 2.0));
    assert!(approx(c.0, 60.0, 1e-3) && approx(c.1, 50.0, 1e-3));
    // Single-axis mirror ⇒ negative determinant.
    let det = flipped.a * flipped.d - flipped.b * flipped.c;
    assert!(det < 0.0);
}

// --- F-3: B1 pivot rule + D-2 under flip --------------------------------

#[test]
fn f3_d2_sibling_stability_under_flipped_group() {
    let build = |ax: f32| {
        let mut b = DocBuilder::new();
        let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
        gh.x = AxisBinding::start(200.0);
        gh.y = AxisBinding::start(100.0);
        gh.flip_x = true;
        gh.rotation = 15.0;
        let g = b.add(0, gh, Payload::Group);
        let (c1h, c1p) = card(50.0, 50.0);
        let a = b.add(g, at(c1h, ax, 0.0), c1p);
        let (c2h, c2p) = card(40.0, 40.0);
        let s = b.add(g, at(c2h, 120.0, 80.0), c2p);
        (b.build(), a, s)
    };
    // Move child A (its stored offset changes); sibling S must not move in
    // world space — origin pivot means the union never feeds back (E-A1),
    // and B1 gives flip the same pivot.
    let (d0, _a0, s0) = build(0.0);
    let (d1, _a1, s1) = build(-60.0);
    let r0 = resolve(&d0, &opts());
    let r1 = resolve(&d1, &opts());
    assert!(
        affine_approx(&r0.world_of(s0), &r1.world_of(s1), 1e-4),
        "sibling moved under flipped group: {:?} vs {:?}",
        r0.world_of(s0),
        r1.world_of(s1)
    );
}

// --- F-4: the cross-zero gesture ----------------------------------------

/// Free frame + one rect; returns (doc, rect id).
fn free_rect() -> (Document, NodeId) {
    let mut b = DocBuilder::new();
    let (ch, cp) = card(140.0, 80.0);
    let id = b.add(0, at(ch, 60.0, 40.0), cp);
    (b.build(), id)
}

#[test]
fn f4_cross_zero_drag_flips_and_tracks_anchor() {
    let (mut doc, id) = free_rect();
    let r = resolve(&doc, &opts());
    // Left edge fixed at 60; user drags the right handle.
    let drag = ResizeDrag::begin(&doc, &r, id, Axis::X, AnchorEdge::Start).unwrap();
    assert_eq!(drag.anchor, 60.0);

    // Still on the base side: plain resize, no flip.
    let n = ops::resize_drag(&mut doc, &r, id, &drag, 260.0).unwrap();
    assert_eq!(n, 2); // extent + position (x unchanged numerically but re-written)
    let r = resolve(&doc, &opts());
    assert_eq!(r.xywh(id), (60.0, 40.0, 200.0, 80.0));
    assert!(!doc.get(id).header.flip_x);

    // Cross the anchor: the box mirrors and keeps tracking the hand.
    let n = ops::resize_drag(&mut doc, &r, id, &drag, -20.0).unwrap();
    assert_eq!(n, 3); // extent + position + flip toggle
    let r = resolve(&doc, &opts());
    assert_eq!(r.xywh(id), (-20.0, 40.0, 80.0, 80.0));
    assert!(doc.get(id).header.flip_x);
    // The fixed edge is still at 60 — now the box's max edge.
    let b = r.box_of(id);
    assert_eq!(b.x + b.w, 60.0);
    // Content is genuinely mirrored: negative determinant.
    let w = r.world_of(id);
    assert!(w.a * w.d - w.b * w.c < 0.0);
}

#[test]
fn f4_cross_zero_round_trip_is_identity() {
    let (mut doc, id) = free_rect();
    let original = doc.clone();
    let r0 = resolve(&doc, &opts());
    let drag = ResizeDrag::begin(&doc, &r0, id, Axis::X, AnchorEdge::Start).unwrap();

    // Out past zero...
    let r = resolve(&doc, &opts());
    ops::resize_drag(&mut doc, &r, id, &drag, -80.0).unwrap();
    // ...through a second move on the far side...
    let r = resolve(&doc, &opts());
    ops::resize_drag(&mut doc, &r, id, &drag, -140.0).unwrap();
    // ...and back to the exact starting handle position (60 + 140).
    let r = resolve(&doc, &opts());
    ops::resize_drag(&mut doc, &r, id, &drag, 200.0).unwrap();

    assert_eq!(doc, original, "drag out and back must be the identity");
}

#[test]
fn f4_zero_width_moment_is_legal_and_unflipped() {
    let (mut doc, id) = free_rect();
    let r = resolve(&doc, &opts());
    let drag = ResizeDrag::begin(&doc, &r, id, Axis::X, AnchorEdge::Start).unwrap();
    // Target exactly at the anchor: extent 0, no flip, no error (N-2 allows
    // zero extents; the sign only appears strictly past the edge).
    ops::resize_drag(&mut doc, &r, id, &drag, 60.0).unwrap();
    let r = resolve(&doc, &opts());
    assert_eq!(r.xywh(id).2, 0.0);
    assert!(!doc.get(id).header.flip_x);
}

#[test]
fn f4_end_edge_drag_crosses_negative_side() {
    let (mut doc, id) = free_rect();
    let r = resolve(&doc, &opts());
    // Right edge fixed at 200; user drags the LEFT handle rightward past it.
    let drag = ResizeDrag::begin(&doc, &r, id, Axis::X, AnchorEdge::End).unwrap();
    assert_eq!(drag.anchor, 200.0);
    let n = ops::resize_drag(&mut doc, &r, id, &drag, 250.0).unwrap();
    assert_eq!(n, 3);
    let r = resolve(&doc, &opts());
    assert_eq!(r.xywh(id), (200.0, 40.0, 50.0, 80.0));
    assert!(doc.get(id).header.flip_x);
}

#[test]
fn f4_in_flow_drag_writes_extent_and_flip_only() {
    let mut b = DocBuilder::new();
    let (fh, fp) = flex_row(460.0, 170.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut mid = 0;
    for i in 0..3 {
        let (ch, cp) = card(60.0, 100.0);
        let id = b.add(f, ch, cp);
        if i == 1 {
            mid = id;
        }
    }
    let mut doc = b.build();
    let r = resolve(&doc, &opts());
    let b0 = r.box_of(mid);
    let drag = ResizeDrag::begin(&doc, &r, mid, Axis::X, AnchorEdge::Start).unwrap();
    // Cross past the anchor: under flex the position write is skipped —
    // layout owns it — so the set shrinks to extent + flip.
    let n = ops::resize_drag(&mut doc, &r, mid, &drag, b0.x - 30.0).unwrap();
    assert_eq!(n, 2);
    assert!(doc.get(mid).header.flip_x);
    assert_eq!(doc.get(mid).header.x, AxisBinding::default());
    // And the row re-lays out around the new 30px mirrored box.
    let r = resolve(&doc, &opts());
    assert_eq!(r.xywh(mid).2, 30.0);
}

// --- F-5: the typed wall ------------------------------------------------

#[test]
fn f5_typed_negative_size_is_rejected_untouched() {
    let (mut doc, id) = free_rect();
    let before = doc.clone();
    assert_eq!(ops::set_width(&mut doc, id, -50.0), Err(OpError::NegativeExtent));
    assert_eq!(ops::set_height(&mut doc, id, -0.5), Err(OpError::NegativeExtent));
    assert_eq!(doc, before, "rejected op must leave the document byte-identical");
}

// --- F-6: ungroup bakes flips exactly ------------------------------------

#[test]
fn f6_ungroup_flipped_group_preserves_world() {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(180.0);
    gh.y = AxisBinding::start(120.0);
    gh.rotation = 25.0;
    gh.flip_x = true;
    let g = b.add(0, gh, Payload::Group);
    // A rotated boxed child and a flipped boxed child — both bake paths.
    let (mut c1h, c1p) = card(70.0, 40.0);
    c1h.rotation = 10.0;
    let a = b.add(g, at(c1h, 10.0, 5.0), c1p);
    let (mut c2h, c2p) = card(50.0, 50.0);
    c2h.flip_y = true;
    let s = b.add(g, at(c2h, 90.0, 60.0), c2p);
    let mut doc = b.build();

    let r0 = resolve(&doc, &opts());
    let wa0 = r0.world_of(a);
    let ws0 = r0.world_of(s);

    ops::ungroup(&mut doc, &r0, g).unwrap();
    let r1 = resolve(&doc, &opts());
    assert!(
        affine_approx(&r1.world_of(a), &wa0, 1e-3),
        "rotated child drifted: {:?} vs {wa0:?}",
        r1.world_of(a)
    );
    assert!(
        affine_approx(&r1.world_of(s), &ws0, 1e-3),
        "flipped child drifted: {:?} vs {ws0:?}",
        r1.world_of(s)
    );
}

// --- IR round trip --------------------------------------------------------

#[test]
fn flip_survives_text_ir_round_trip() {
    let (mut doc, id) = free_rect();
    doc.get_mut(id).header.flip_x = true;
    doc.get_mut(id).header.rotation = 12.0;
    let printed = anchor_lab::textir::print(&doc);
    assert!(printed.contains("flip-x=\"true\""));
    let parsed = anchor_lab::textir::parse(&printed).unwrap();
    let reprinted = anchor_lab::textir::print(&parsed);
    assert_eq!(printed, reprinted);
}
