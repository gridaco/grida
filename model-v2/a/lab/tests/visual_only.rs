//! DEC-0 conformance — the VISUAL-ONLY default (dec0-visual-only.md).
//! Sizing never reads rotation/flips (CSS-pure); reads stay oriented.
//! Every rule V-1…V-9 that changes behavior vs the anchor arm gets its
//! floor here; the anchor arm stays guarded by the pinned suites.

mod common;
use common::*;

use anchor_lab::math::rotated_aabb_size;
use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, Report, Resolved};

/// The DEFAULT options — deliberately `Default::default()`: this suite
/// guards what a consumer gets without asking.
fn run_default(doc: &Document) -> Resolved {
    resolve(
        doc,
        &anchor_lab::resolve::ResolveOptions {
            viewport: (1000.0, 1000.0),
            ..Default::default()
        },
    )
}

fn at(mut h: Header, x: f32, y: f32) -> Header {
    h.x = AxisBinding::start(x);
    h.y = AxisBinding::start(y);
    h
}

/// Fixed 460x170 row (gap 10, pad 10), three 60x100 cards; `mutate`
/// tweaks the middle card.
fn row_doc(mutate: impl Fn(&mut Header)) -> (Document, [NodeId; 3], NodeId) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Fixed(460.0),
        SizeIntent::Fixed(170.0),
        Direction::Row,
        10.0,
        10.0,
    );
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut ids = [0u32; 3];
    for (i, slot) in ids.iter_mut().enumerate() {
        let (mut ch, cp) = shape(60.0, 100.0);
        if i == 1 {
            mutate(&mut ch);
        }
        *slot = b.add(f, ch, cp);
    }
    (b.build(), ids, f)
}

// ── V-1: flex contribution is the unrotated box ─────────────────────

#[test]
fn v1_rotated_child_contributes_unrotated_box() {
    let (plain, pids, _) = row_doc(|_| {});
    let (rotated, rids, _) = row_doc(|h| h.rotation = 45.0);
    let rp = run_default(&plain);
    let rr = run_default(&rotated);
    // Sizing identical: every box the same as the unrotated document.
    for (p, r) in pids.iter().zip(rids.iter()) {
        let (bp, br) = (rp.box_of(*p), rr.box_of(*r));
        assert_rect(br, bp.x, bp.y, bp.w, bp.h, "box unchanged by rotation");
    }
}

#[test]
fn v1_overlap_is_correct_behavior() {
    let (doc, ids, _) = row_doc(|h| h.rotation = 45.0);
    let r = run_default(&doc);
    // Boxes stay disjoint (they never moved)…
    assert!(r.box_of(ids[1]).intersection_area(&r.box_of(ids[2])) == 0.0);
    // …while the INK envelope overlaps the neighbor — visual-only's
    // accepted behavior, visible in the read tier.
    assert!(r.aabb_of(ids[1]).intersection_area(&r.aabb_of(ids[2])) > 0.0);
}

// ── V-2: fill never fights rotation ─────────────────────────────────

#[test]
fn v2_grow_is_continuous_under_rotation() {
    let widths: Vec<f32> = [0.0f32, 3.0, 45.0, 90.0]
        .iter()
        .map(|theta| {
            let (doc, ids, _) = row_doc(|h| {
                h.grow = 1.0;
                h.rotation = *theta;
            });
            run_default(&doc).box_of(ids[1]).w
        })
        .collect();
    // The grown width is the same at EVERY angle — the E-A11 pop cannot
    // exist under visual-only.
    for w in &widths {
        assert_close(*w, widths[0], "grown width angle-invariant");
    }
    assert!(widths[0] > 250.0, "grow actually filled: {}", widths[0]);
}

#[test]
fn v2_stretch_applies_to_rotated_child() {
    let (doc, ids, _) = row_doc(|h| {
        h.self_align = SelfAlign::Stretch;
        h.height = SizeIntent::Auto;
        h.rotation = 30.0;
    });
    let r = run_default(&doc);
    // Stretch fills the content cross size (170 - 2*10 padding).
    assert_close(r.box_of(ids[1]).h, 150.0, "stretch applies while rotated");
}

#[test]
fn v2_no_inert_reports() {
    let (doc, _, _) = row_doc(|h| {
        h.grow = 1.0;
        h.rotation = 30.0;
    });
    let r = run_default(&doc);
    let inert = r.reports.iter().any(|rep| {
        matches!(rep, Report::IgnoredByRule { field, .. }
            if *field == "grow" || *field == "self_align")
    });
    assert!(
        !inert,
        "nothing is ignored-for-rotation anymore: {:?}",
        r.reports
    );
}

// ── V-3: hug ignores transforms (flex AND free) ──────────────────────

#[test]
fn v3_flex_hug_ignores_rotation() {
    let hug_w = |theta: f32| {
        let mut b = DocBuilder::new();
        let (fh, fp) = frame_flex(
            SizeIntent::Auto,
            SizeIntent::Fixed(170.0),
            Direction::Row,
            10.0,
            10.0,
        );
        let f = b.add(0, at(fh, 20.0, 20.0), fp);
        for i in 0..3 {
            let (mut ch, cp) = shape(60.0, 100.0);
            if i == 1 {
                ch.rotation = theta;
            }
            b.add(f, ch, cp);
        }
        run_default(&b.build()).box_of(f).w
    };
    assert_close(hug_w(60.0), hug_w(0.0), "flex hug angle-invariant");
}

#[test]
fn v3_free_hug_ignores_rotation_and_flip() {
    let hug = |theta: f32, flip: bool| {
        let mut b = DocBuilder::new();
        let (fh, fp) = frame_free(SizeIntent::Auto, SizeIntent::Auto);
        let f = b.add(0, at(fh, 20.0, 20.0), fp);
        let (mut ch, cp) = shape(120.0, 40.0);
        ch.x = AxisBinding::start(10.0);
        ch.y = AxisBinding::start(10.0);
        ch.rotation = theta;
        ch.flip_x = flip;
        b.add(f, ch, cp);
        let r = run_default(&b.build());
        r.box_of(f)
    };
    let base = hug(0.0, false);
    assert_rect(base, 20.0, 20.0, 130.0, 50.0, "hug = pins + box");
    let turned = hug(75.0, true);
    assert_rect(
        turned,
        base.x,
        base.y,
        base.w,
        base.h,
        "free hug ignores rotation and flip (CSS-pure)",
    );
}

// ── V-4: the derived box is sizing-tier ───────────────────────────────

#[test]
fn v4_group_box_is_unrotated_union() {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(200.0);
    gh.y = AxisBinding::start(100.0);
    let g = b.add(0, gh, Payload::Group);
    let (mut ch, cp) = shape(100.0, 20.0);
    ch.rotation = 45.0;
    let c = b.add(g, ch, cp);
    let doc = b.build();
    let r = run_default(&doc);
    // Sizing tier: the member's UNROTATED box.
    assert_rect(
        r.box_of(g),
        200.0,
        100.0,
        100.0,
        20.0,
        "group box unrotated",
    );
    // Read tier: the ink is oriented and larger.
    let ink = r.aabb_of(c);
    let (ew, eh) = rotated_aabb_size(100.0, 20.0, 45.0);
    assert_close(ink.w, ew, "ink envelope w");
    assert_close(ink.h, eh, "ink envelope h");
    // Note the direction: a flat bar's 45° envelope is NARROWER than its
    // width (84.85 < 100) — ink vs box can differ either way per axis.
    // The height is where this member's ink provably exceeds the box.
    assert!(r.aabb_of(g).h > r.box_of(g).h, "group ink taller than box");
}

#[test]
fn v4_group_flex_contribution_is_unrotated() {
    // A group whose member is rotated sits in a row next to a card: the
    // card's position derives from the UNROTATED union width.
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Fixed(460.0),
        SizeIntent::Fixed(170.0),
        Direction::Row,
        10.0,
        10.0,
    );
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let g = b.add(
        f,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Group,
    );
    let (mut m, mp) = shape(100.0, 20.0);
    m.rotation = 45.0;
    b.add(g, m, mp);
    let (nh, np) = shape(60.0, 100.0);
    let n = b.add(f, nh, np);
    let r = run_default(&b.build());
    // pad 10 + group slot 100 (unrotated union) + gap 10 = 120.
    assert_close(r.box_of(n).x, 120.0, "neighbor placed by unrotated union");
}

#[test]
fn v4_group_own_rotation_paints_only() {
    let build = |theta: f32| {
        let mut b = DocBuilder::new();
        let (fh, fp) = frame_flex(
            SizeIntent::Fixed(460.0),
            SizeIntent::Fixed(170.0),
            Direction::Row,
            10.0,
            10.0,
        );
        let f = b.add(0, at(fh, 20.0, 20.0), fp);
        let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
        gh.rotation = theta;
        let g = b.add(f, gh, Payload::Group);
        let (m, mp) = shape(80.0, 40.0);
        b.add(g, m, mp);
        let (nh, np) = shape(60.0, 100.0);
        let n = b.add(f, nh, np);
        (b.build(), g, n)
    };
    let (d0, _, n0) = build(0.0);
    let (d1, g1, n1) = build(50.0);
    let r0 = run_default(&d0);
    let r1 = run_default(&d1);
    // Sibling untouched by the group's own rotation…
    assert_close(r1.box_of(n1).x, r0.box_of(n0).x, "sibling stable");
    // …while the group's ink really turned (read tier).
    assert!(r1.aabb_of(g1).h > r1.box_of(g1).h + 1.0, "ink rotated");
}

#[test]
fn v4_nested_union_offsets_still_exact() {
    // Translation-only nesting must survive the V-4 path (the census's
    // nested-offset fix, re-proven under visual-only).
    let mut b = DocBuilder::new();
    let mut outer_h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    outer_h.x = AxisBinding::start(50.0);
    outer_h.y = AxisBinding::start(60.0);
    let outer = b.add(0, outer_h, Payload::Group);
    let mut inner_h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    inner_h.x = AxisBinding::start(20.0);
    inner_h.y = AxisBinding::start(30.0);
    let inner = b.add(outer, inner_h, Payload::Group);
    let (mut ch, cp) = shape(40.0, 40.0);
    ch.x = AxisBinding::start(5.0);
    ch.y = AxisBinding::start(7.0);
    let c = b.add(inner, ch, cp);
    let r = run_default(&b.build());
    assert_rect(r.box_of(inner), 25.0, 37.0, 40.0, 40.0, "inner box");
    assert_rect(r.box_of(outer), 75.0, 97.0, 40.0, 40.0, "outer box");
    let w = r.world_of(c);
    assert_close(w.e, 75.0, "leaf world x");
    assert_close(w.f, 97.0, "leaf world y");
}

// ── V-7: lens-rotate ≡ header-rotate ─────────────────────────────────

#[test]
fn v7_lens_rotate_equals_header_rotate() {
    let theta = 33.0;
    // Arm A: header rotation.
    let mut a = DocBuilder::new();
    let (fh, fp) = frame_flex(
        SizeIntent::Fixed(460.0),
        SizeIntent::Fixed(170.0),
        Direction::Row,
        10.0,
        10.0,
    );
    let fa = a.add(0, at(fh.clone(), 20.0, 20.0), fp.clone());
    let (mut ha, pa) = shape(60.0, 100.0);
    ha.rotation = theta;
    let ca = a.add(fa, ha, pa);
    let da = a.build();
    // Arm B: lens rotation around the same child.
    let mut bb = DocBuilder::new();
    let fb = bb.add(0, at(fh, 20.0, 20.0), fp);
    let l = bb.add(
        fb,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens {
            ops: vec![LensOp::Rotate { deg: theta }],
        },
    );
    let (hb, pb) = shape(60.0, 100.0);
    let cb = bb.add(l, hb, pb);
    let db = bb.build();

    let ra = run_default(&da);
    let rb = run_default(&db);
    let (wa, wb) = (ra.world_of(ca), rb.world_of(cb));
    for (x, y) in [(wa.a, wb.a), (wa.b, wb.b), (wa.e, wb.e), (wa.f, wb.f)] {
        assert_close(x, y, "lens-rotate ≡ header-rotate under visual-only");
    }
}

// ── V-8: reads stay oriented ─────────────────────────────────────────

#[test]
fn v8_world_aabb_is_the_oriented_envelope() {
    let (doc, ids, _) = row_doc(|h| h.rotation = 37.0);
    let r = run_default(&doc);
    let (ew, eh) = rotated_aabb_size(60.0, 100.0, 37.0);
    let ink = r.aabb_of(ids[1]);
    assert_close(ink.w, ew, "read tier envelope w");
    assert_close(ink.h, eh, "read tier envelope h");
}

// ── UB hunt: hug of a group of rotated ────────────────────────────────

#[test]
fn v3v4_hug_of_group_of_rotated() {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_free(SizeIntent::Auto, SizeIntent::Auto);
    let f = b.add(0, at(fh, 10.0, 10.0), fp);
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(15.0);
    gh.y = AxisBinding::start(25.0);
    let g = b.add(f, gh, Payload::Group);
    let (mut ch, cp) = shape(100.0, 20.0);
    ch.rotation = 45.0;
    b.add(g, ch, cp);
    let r = run_default(&b.build());
    // Hug wraps the group's SIZING box (unrotated union at its pins):
    // 15 + 100 wide, 25 + 20 tall — no envelope anywhere in sizing.
    assert_rect(
        r.box_of(f),
        10.0,
        10.0,
        115.0,
        45.0,
        "hug of group of rotated",
    );
    // The ink still escapes, visibly, in the read tier.
    assert!(r.aabb_of(f).w > r.box_of(f).w - 1.0);
}
