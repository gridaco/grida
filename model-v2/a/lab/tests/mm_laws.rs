//! Metamorphic laws (conformance.md §1) — properties over pairs of documents.

mod common;
use common::*;

use anchor_lab::model::*;
use anchor_lab::ops;
use anchor_lab::resolve::resolve;

fn sample_doc() -> (Document, NodeId, NodeId, NodeId) {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_free(SizeIntent::Fixed(400.0), SizeIntent::Fixed(300.0));
    let mut fh = fh;
    fh.x = AxisBinding::start(50.0);
    fh.y = AxisBinding::start(60.0);
    let f = b.add(0, fh, fp);
    let (mut sh, sp) = shape(120.0, 80.0);
    sh.x = AxisBinding::start(10.0);
    sh.y = AxisBinding::start(20.0);
    sh.rotation = 15.0;
    let s = b.add(f, sh, sp);
    let (mut th, tp) = shape(40.0, 40.0);
    th.x = AxisBinding::end(24.0);
    th.y = AxisBinding::center(0.0);
    let t = b.add(f, th, tp);
    (b.build(), f, s, t)
}

/// MM-1: translating a parent translates every descendant world transform
/// by exactly (dx,dy) and nothing else.
#[test]
fn mm1_parent_translation_propagates_exactly() {
    let (doc, f, s, t) = sample_doc();
    let r1 = run(&doc);

    let mut doc2 = doc.clone();
    let r0 = run(&doc2);
    ops::move_by(&mut doc2, &r0, f, 7.0, -13.0).unwrap();
    let r2 = run(&doc2);

    for id in [f, s, t] {
        let w1 = r1.world_of(id);
        let w2 = r2.world_of(id);
        assert_close(w2.e - w1.e, 7.0, "dx");
        assert_close(w2.f - w1.f, -13.0, "dy");
        assert_close(w1.a, w2.a, "a unchanged");
        assert_close(w1.b, w2.b, "b unchanged");
        assert_close(w1.c, w2.c, "c unchanged");
        assert_close(w1.d, w2.d, "d unchanged");
    }
}

/// MM-2: rotate(θ) then rotate(−θ) restores identical resolved geometry.
#[test]
fn mm2_rotation_roundtrip_restores_geometry() {
    let (doc, _, s, _) = sample_doc();
    let r1 = run(&doc);

    let mut doc2 = doc.clone();
    ops::set_rotation(&mut doc2, s, 15.0 + 33.0).unwrap();
    ops::set_rotation(&mut doc2, s, 15.0).unwrap();
    let r2 = run(&doc2);

    assert_eq!(doc, doc2, "document restored byte-for-byte");
    let (w1, w2) = (r1.world_of(s), r2.world_of(s));
    assert_eq!(
        (w1.a, w1.b, w1.c, w1.d, w1.e, w1.f),
        (w2.a, w2.b, w2.c, w2.d, w2.e, w2.f),
        "resolved world identical"
    );
}

/// MM-3: resolution is a pure function — identical output run-to-run.
#[test]
fn mm3_determinism() {
    let (doc, _, s, t) = sample_doc();
    let r1 = run(&doc);
    let r2 = run(&doc);
    for id in [s, t] {
        assert_eq!(r1.world_of(id), r2.world_of(id));
        assert_eq!(r1.box_of(id), r2.box_of(id));
        assert_eq!(r1.aabb_of(id), r2.aabb_of(id));
    }
}

/// MM-4: a free node's geometry is viewport-independent (only the
/// viewport-bound root's subtree sizing paths may react).
#[test]
fn mm4_viewport_independence_of_fixed_free_nodes() {
    let (doc, f, s, _) = sample_doc();
    let r1 = resolve(&doc, &opts());
    let mut o2 = opts();
    o2.viewport = (640.0, 480.0);
    let r2 = resolve(&doc, &o2);
    // f is Start-pinned with Fixed size: unaffected by viewport.
    assert_eq!(r1.box_of(f), r2.box_of(f));
    assert_eq!(r1.world_of(s), r2.world_of(s));
}

/// MM-5: writes to independent fields commute.
#[test]
fn mm5_independent_writes_commute() {
    let (doc, _, s, t) = sample_doc();

    let mut d1 = doc.clone();
    let r = run(&d1);
    ops::set_rotation(&mut d1, s, 45.0).unwrap();
    ops::set_width(&mut d1, t, 55.0).unwrap();
    let _ = r;

    let mut d2 = doc.clone();
    ops::set_width(&mut d2, t, 55.0).unwrap();
    ops::set_rotation(&mut d2, s, 45.0).unwrap();

    assert_eq!(d1, d2, "A;B ≡ B;A on the document");
}

/// MM-6 (declared POL): hidden children do not affect siblings' geometry.
#[test]
fn mm6_hidden_child_does_not_move_siblings() {
    let mut b = DocBuilder::new();
    let f = b.add(
        0,
        frame_flex(
            SizeIntent::Fixed(500.0),
            SizeIntent::Fixed(100.0),
            Direction::Row,
            10.0,
            0.0,
        )
        .0,
        frame_flex(
            SizeIntent::Fixed(500.0),
            SizeIntent::Fixed(100.0),
            Direction::Row,
            10.0,
            0.0,
        )
        .1,
    );
    let (h1, p1) = shape(50.0, 50.0);
    let a = b.add(f, h1, p1);
    let (h2, p2) = shape(50.0, 50.0);
    let hidden = b.add(f, h2, p2);
    let (h3, p3) = shape(50.0, 50.0);
    let c = b.add(f, h3, p3);
    let doc_visible = b.build();

    let mut doc_hidden = doc_visible.clone();
    doc_hidden.get_mut(hidden).header.active = false;

    let rv = run(&doc_visible);
    let rh = run(&doc_hidden);
    // with the middle child hidden, c moves to where the hidden one was
    assert_close(rv.box_of(a).x, rh.box_of(a).x, "a stable");
    assert_close(rv.box_of(hidden).x, rh.box_of(c).x, "c takes the slot");
    assert!(rh.world_opt(hidden).is_none(), "hidden not resolved");
}

/// MM-7: adding then deleting a node restores prior resolved geometry.
#[test]
fn mm7_add_delete_restores() {
    let (doc, f, s, t) = sample_doc();
    let r1 = run(&doc);

    let mut doc2 = doc.clone();
    let new_id = 999; // sparse id: the arena grows, and semantic
                      // equality ignores the tombstoned tail (MM-7).
    doc2.add_child(
        f,
        Node {
            id: new_id,
            header: shape(10.0, 10.0).0,
            payload: shape(10.0, 10.0).1,
            children: vec![],
            fills: Paints::default(),
            strokes: vec![],
        },
    );
    let _mid = run(&doc2);
    doc2.remove_subtree(new_id);
    assert_eq!(doc, doc2);
    let r2 = run(&doc2);
    for id in [s, t] {
        assert_eq!(r1.world_of(id), r2.world_of(id));
    }
}

/// MM-9 (via the sanctioned ungroup bake): composed local placement
/// preserves world transforms within tolerance (also D-4).
#[test]
fn mm9_ungroup_preserves_world_transforms() {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(100.0);
    gh.y = AxisBinding::start(50.0);
    gh.rotation = 30.0;
    let g = b.add(0, gh, Payload::Group);
    let (mut s1h, s1p) = shape(40.0, 40.0);
    s1h.rotation = 10.0;
    let s1 = b.add(g, s1h, s1p);
    let (mut s2h, s2p) = shape(40.0, 40.0);
    s2h.x = AxisBinding::start(56.0);
    let s2 = b.add(g, s2h, s2p);
    let mut doc = b.build();

    let before = run(&doc);
    let w1 = before.world_of(s1);
    let w2 = before.world_of(s2);

    anchor_lab::ops::ungroup(&mut doc, &before, g).unwrap();
    assert!(doc.get_opt(g).is_none(), "group dissolved");

    let after = run(&doc);
    for (id, w) in [(s1, w1), (s2, w2)] {
        let v = after.world_of(id);
        assert_close(v.a, w.a, "a");
        assert_close(v.b, w.b, "b");
        assert_close(v.c, w.c, "c");
        assert_close(v.d, w.d, "d");
        assert_close(v.e, w.e, "e");
        assert_close(v.f, w.f, "f");
    }
}
