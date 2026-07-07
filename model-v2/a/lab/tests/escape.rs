//! The escape hatches from layout-visible rotation (owner question,
//! 2026-07-07): can a user opt OUT of "AABB participates" per node?
//!
//! Three structural escapes, no mode flag:
//!   1. lens-rotate      → paint-only rotation; slot = unrotated box
//!                         (the CSS-semantics twin, exactly)
//!   2. flow="absolute"  → out of flow entirely
//!   3. wrapper frame    → custom slot reservation (incl. the
//!                         diagonal-stable wrapper: zero breathing at any θ)

mod common;
use common::*;

use anchor_lab::model::*;
use anchor_lab::resolve::resolve;

fn flex_row_of_cards() -> DocBuilder {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Fixed(140.0),
        Direction::Row,
        10.0,
        10.0,
    );
    b.add(0, h, p);
    b
}

/// Escape 1: a lens with a Rotate op reproduces the visual-only arm
/// EXACTLY — unrotated box holds the slot, rotation is paint-only.
#[test]
fn lens_rotate_is_the_visual_only_twin() {
    // Document A: header rotation, resolved under the CSS control flag.
    let mut ba = flex_row_of_cards();
    let f_a = 1;
    let mut cards_a = vec![];
    for _ in 0..3 {
        let (h, p) = shape(60.0, 100.0);
        cards_a.push(ba.add(f_a, h, p));
    }
    let mut doc_a = ba.build();
    doc_a.get_mut(cards_a[1]).header.rotation = 90.0;
    let ra = resolve(&doc_a, &opts_visual());

    // Document B: lens-wrapped middle card, resolved under the LOCKED
    // default (AABB participates). The lens is layout-transparent, so
    // its pre-ops (unrotated) box takes the slot.
    let mut bb = flex_row_of_cards();
    let f_b = 1;
    let (h0, p0) = shape(60.0, 100.0);
    let c0 = bb.add(f_b, h0, p0);
    let lens = bb.add(
        f_b,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens {
            ops: vec![LensOp::Rotate { deg: 90.0 }],
        },
    );
    let (h1, p1) = shape(60.0, 100.0);
    let inner = bb.add(lens, h1, p1);
    let (h2, p2) = shape(60.0, 100.0);
    let c2 = bb.add(f_b, h2, p2);
    let doc_b = bb.build();
    let rb = resolve(&doc_b, &opts()); // default: AabbParticipates

    // identical layout: container width, sibling slots
    assert_close(ra.box_of(f_a).w, 220.0, "control container");
    assert_close(rb.box_of(f_b).w, 220.0, "lens escape container");
    assert_close(
        ra.box_of(cards_a[2]).x,
        rb.box_of(c2).x,
        "third card position identical",
    );
    // identical paint: the rotated card's world AABB matches
    let aabb_a = ra.aabb_of(cards_a[1]);
    let aabb_b = rb.aabb_of(inner);
    assert_close(aabb_a.w, aabb_b.w, "painted envelope w");
    assert_close(aabb_a.h, aabb_b.h, "painted envelope h");
    assert_close(aabb_a.x, aabb_b.x, "painted envelope x");
    // and the overlap the user asked for is present in both
    let ov = rb.aabb_of(c0).intersection_area(&rb.aabb_of(inner));
    assert_close(ov, 600.0, "paint-only overlap, opted into deliberately");
}

/// Escape 3: a fixed wrapper frame owns the slot; the rotated child
/// paints beyond it. Sized to the diagonal, the slot is θ-stable —
/// zero container breathing at ANY angle (the animation-friendly form).
#[test]
fn diagonal_wrapper_gives_theta_stable_slot() {
    let diag = (60.0f32 * 60.0 + 100.0 * 100.0).sqrt(); // 116.62
    let mut widths = vec![];
    for theta in [0.0f32, 30.0, 59.0, 90.0, 137.0] {
        let mut b = flex_row_of_cards();
        let f = 1;
        let (h0, p0) = shape(60.0, 100.0);
        b.add(f, h0, p0);
        // wrapper: fixed diagonal-sized free frame, no layout, no clip
        let wrap = b.add(
            f,
            Header::new(SizeIntent::Fixed(diag), SizeIntent::Fixed(diag)),
            Payload::Frame {
                layout: LayoutBehavior::default(),
                clips_content: false,
            },
        );
        let (mut hc, pc) = shape(60.0, 100.0);
        hc.x = AxisBinding::center(0.0);
        hc.y = AxisBinding::center(0.0);
        hc.rotation = theta;
        b.add(wrap, hc, pc);
        let (h2, p2) = shape(60.0, 100.0);
        b.add(f, h2, p2);
        let doc = b.build();
        let r = resolve(&doc, &opts());
        widths.push(r.box_of(f).w);
    }
    // container width identical at every angle: the wrapper absorbed
    // the envelope; nothing breathes, nothing overlaps siblings
    for w in &widths {
        assert_close(*w, widths[0], "θ-stable container");
    }
    assert_close(widths[0], 10.0 + 60.0 + 10.0 + 116.61903 + 10.0 + 60.0 + 10.0, "diagonal slot");
}
