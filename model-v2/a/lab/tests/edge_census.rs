//! Edge census — the ship-readiness sweep across implemented kinds
//! (text, group, lens, rotation extremes, degenerate boxes).
//! Every test either proves an edge or would have become a finding.

mod common;
use common::*;

use anchor_lab::math::Affine;
use anchor_lab::model::*;

// ---------- text edges ----------

/// Empty text: zero width, one line-height tall — never a NaN, never 0×0.
#[test]
fn text_empty_string() {
    let mut b = DocBuilder::new();
    let t = b.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Text {
            content: String::new(),
            font_size: 16.0,
        },
    );
    let r = run(&b.build());
    let bx = r.box_of(t);
    assert_close(bx.w, 0.0, "empty text w");
    assert_close(bx.h, 19.2, "empty text keeps line height");
}

/// A single word wider than the fixed width: no mid-word break — the box
/// keeps the fixed width, content overflows in paint (declared).
#[test]
fn text_giant_word_no_break() {
    let mut b = DocBuilder::new();
    let t = b.add(
        0,
        Header::new(SizeIntent::Fixed(30.0), SizeIntent::Auto),
        Payload::Text {
            content: "unbreakable".into(), // 11 chars × 6 = 66 > 30
            font_size: 10.0,
        },
    );
    let r = run(&b.build());
    let bx = r.box_of(t);
    assert_close(bx.w, 30.0, "fixed width kept");
    assert_close(bx.h, 12.0, "single line despite overflow");
}

/// Fixed height smaller than content: the box is the intent; overflow is
/// a paint concern (T-E2 positioning math is renderer work).
#[test]
fn text_fixed_height_clips_not_grows() {
    let mut b = DocBuilder::new();
    let t = b.add(
        0,
        Header::new(SizeIntent::Fixed(36.0), SizeIntent::Fixed(10.0)),
        Payload::Text {
            content: "hello world".into(), // wraps to 2 lines at 36
            font_size: 10.0,
        },
    );
    let r = run(&b.build());
    assert_close(r.box_of(t).h, 10.0, "declared height wins the box");
}

/// Text as the only child of a 3-deep hug chain: measurement propagates
/// bottom-up through every hug without a cycle.
#[test]
fn text_hug_chain_3_deep() {
    let mut b = DocBuilder::new();
    let mut parent = 0;
    let mut frames = vec![];
    for _ in 0..3 {
        let (h, p) = frame_flex(
            SizeIntent::Auto,
            SizeIntent::Auto,
            Direction::Row,
            0.0,
            5.0,
        );
        parent = b.add(parent, h, p);
        frames.push(parent);
    }
    let t = b.add(
        parent,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Text {
            content: "hi".into(),
            font_size: 10.0,
        },
    );
    let r = run(&b.build());
    assert_close(r.box_of(t).w, 12.0, "text natural");
    // each hug adds 10 (padding 5×2)
    assert_close(r.box_of(frames[2]).w, 22.0, "inner hug");
    assert_close(r.box_of(frames[1]).w, 32.0, "middle hug");
    assert_close(r.box_of(frames[0]).w, 42.0, "outer hug");
}

/// min clamps beat the measured size (measured kind × constraint).
#[test]
fn text_min_width_beats_measured() {
    let mut b = DocBuilder::new();
    let mut h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    h.min_width = Some(100.0);
    let t = b.add(
        0,
        h,
        Payload::Text {
            content: "hi".into(), // natural 12
            font_size: 10.0,
        },
    );
    let r = run(&b.build());
    assert_close(r.box_of(t).w, 100.0, "min wins");
}

// ---------- group edges ----------

/// Empty group in flex: zero-extent slot; siblings separated by gaps only.
#[test]
fn empty_group_in_flex() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Fixed(100.0),
        Direction::Row,
        10.0,
        10.0,
    );
    let f = b.add(0, h, p);
    let (h1, p1) = shape(50.0, 50.0);
    b.add(f, h1, p1);
    b.add(f, Header::new(SizeIntent::Auto, SizeIntent::Auto), Payload::Group);
    let (h2, p2) = shape(50.0, 50.0);
    let c = b.add(f, h2, p2);
    let r = run(&b.build());
    // 10 + 50 + 10 + 0 + 10 = 80
    assert_close(r.box_of(c).x, 80.0, "zero slot + both gaps");
}

/// Group whose only child is hidden ≡ empty group (union skips inactive).
#[test]
fn group_of_hidden_children_is_empty() {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(40.0);
    let g = b.add(0, gh, Payload::Group);
    let (mut h1, p1) = shape(50.0, 50.0);
    h1.active = false;
    b.add(g, h1, p1);
    let r = run(&b.build());
    assert_rect(r.box_of(g), 40.0, 0.0, 0.0, 0.0, "empty union at origin");
}

/// Nested groups 3 deep, each rotated: composition stays rigid and
/// editing the innermost child never moves the outer sibling (D-E2).
#[test]
fn nested_groups_3_deep_rotated() {
    let build = |inner_x: f32| {
        let mut b = DocBuilder::new();
        let mut g1h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
        g1h.x = AxisBinding::start(100.0);
        g1h.rotation = 10.0;
        let g1 = b.add(0, g1h, Payload::Group);
        let (sh, sp) = shape(30.0, 30.0); // outer sibling
        let s = b.add(g1, sh, sp);
        let mut g2h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
        g2h.x = AxisBinding::start(50.0);
        g2h.rotation = 15.0;
        let g2 = b.add(g1, g2h, Payload::Group);
        let mut g3h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
        g3h.rotation = 20.0;
        let g3 = b.add(g2, g3h, Payload::Group);
        let (mut ch, cp) = shape(20.0, 20.0);
        ch.x = AxisBinding::start(inner_x);
        let c = b.add(g3, ch, cp);
        (b.build(), s, c)
    };
    let (d1, s1, c1) = build(0.0);
    let (d2, s2, _) = build(-25.0); // move the innermost child
    let r1 = run(&d1);
    let r2 = run(&d2);
    // outer sibling world-stable under inner edit (origin placement at depth)
    let p1 = r1.world_of(s1).apply((0.0, 0.0));
    let p2 = r2.world_of(s2).apply((0.0, 0.0));
    assert_close(p1.0, p2.0, "sibling stable x at depth");
    assert_close(p1.1, p2.1, "sibling stable y at depth");
    // and rotations compose (10+15+20 = 45 on the innermost child)
    let w = r1.world_of(c1);
    let ang = w.b.atan2(w.a).to_degrees();
    assert_close(ang, 45.0, "rotations compose at depth");
}

/// Union of rotated members uses oriented corners at every level.
#[test]
fn group_union_of_rotated_members() {
    let mut b = DocBuilder::new();
    let g = b.add(0, Header::new(SizeIntent::Auto, SizeIntent::Auto), Payload::Group);
    let (mut h1, p1) = shape(40.0, 40.0);
    h1.rotation = 45.0; // envelope 56.57 about center (20,20)
    b.add(g, h1, p1);
    let r = run(&b.build());
    let u = r.box_of(g);
    let d = 40.0 * (2.0f32).sqrt();
    assert_close(u.w, d, "oriented union w");
    assert_close(u.h, d, "oriented union h");
}

// ---------- lens edges ----------

/// Lens-in-lens: ops compose outer∘inner (nesting = composition, declared).
#[test]
fn lens_in_lens_composes() {
    let mut b = DocBuilder::new();
    let l1 = b.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens {
            ops: vec![LensOp::Translate { x: 10.0, y: 0.0 }],
        },
    );
    let l2 = b.add(
        l1,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens {
            ops: vec![LensOp::Translate { x: 0.0, y: 5.0 }],
        },
    );
    let (sh, sp) = shape(20.0, 20.0);
    let s = b.add(l2, sh, sp);
    let r = run(&b.build());
    let p = r.world_of(s).apply((0.0, 0.0));
    assert_close(p.0, 10.0, "outer op applied");
    assert_close(p.1, 5.0, "inner op applied");
}

/// Ordered ops: rotate∘scale ≠ scale∘rotate — the list order is honored.
#[test]
fn lens_ops_order_matters() {
    let world_of = |ops: Vec<LensOp>| {
        let mut b = DocBuilder::new();
        let l = b.add(
            0,
            Header::new(SizeIntent::Auto, SizeIntent::Auto),
            Payload::Lens { ops },
        );
        let (sh, sp) = shape(20.0, 10.0);
        let s = b.add(l, sh, sp);
        let r = run(&b.build());
        r.world_of(s)
    };
    let a = world_of(vec![
        LensOp::Rotate { deg: 90.0 },
        LensOp::Scale { x: 2.0, y: 1.0 },
    ]);
    let bm = world_of(vec![
        LensOp::Scale { x: 2.0, y: 1.0 },
        LensOp::Rotate { deg: 90.0 },
    ]);
    assert!(
        (a.a - bm.a).abs() > 1e-3 || (a.b - bm.b).abs() > 1e-3 || (a.e - bm.e).abs() > 1e-3,
        "op order is semantic"
    );
}

/// Matrix op with negative determinant: a flip smuggled through the
/// quarantine renders as given (the lens is the anything-goes tier).
#[test]
fn lens_matrix_negative_determinant() {
    let mut b = DocBuilder::new();
    let l = b.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens {
            ops: vec![LensOp::Matrix {
                m: [-1.0, 0.0, 0.0, 1.0, 40.0, 0.0], // mirror-x then shift
            }],
        },
    );
    let (sh, sp) = shape(20.0, 10.0);
    let s = b.add(l, sh, sp);
    let r = run(&b.build());
    let w = r.world_of(s);
    let det = w.a * w.d - w.b * w.c;
    assert!(det < 0.0, "negative determinant preserved");
}

/// Scale(0) collapses paint but never poisons layout: the pre-ops box
/// still participates; world AABB degenerates to a point, finitely.
#[test]
fn lens_scale_zero_degenerate() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Fixed(100.0),
        Direction::Row,
        10.0,
        10.0,
    );
    let f = b.add(0, h, p);
    let l = b.add(
        f,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens {
            ops: vec![LensOp::Scale { x: 0.0, y: 0.0 }],
        },
    );
    let (sh, sp) = shape(50.0, 50.0);
    b.add(l, sh, sp);
    let (h2, p2) = shape(50.0, 50.0);
    let c = b.add(f, h2, p2);
    let r = run(&b.build());
    assert_close(r.box_of(c).x, 70.0, "layout uses pre-ops box (10+50+10)");
    let aabb = r.aabb_of(l);
    assert!(aabb.w.is_finite() && aabb.w < 1e-3, "paint collapsed, finite");
}

// ---------- rotation extremes ----------

/// Winding is authored intent: rotation=450 resolves like 90° but the
/// document keeps 450 (R-E2's stored-as-authored half).
#[test]
fn rotation_winding_stored_as_authored() {
    let mut b = DocBuilder::new();
    let (mut h, p) = shape(100.0, 50.0);
    h.rotation = 450.0;
    let s = b.add(0, h, p);
    let doc = b.build();
    let r = run(&doc);
    let w90 = Affine::rotate_deg(90.0);
    let w = r.world_of(s);
    assert_close(w.a, w90.a, "resolves as 90°");
    assert_close(w.b, w90.b, "resolves as 90°");
    assert_eq!(doc.get(s).header.rotation, 450.0, "document keeps 450");
}

/// Full-bleed Span child rotated: the box stays edge-bound; the corners
/// swing outside the parent (declared: clipping is paint, never geometry).
#[test]
fn span_full_bleed_rotated_overflows() {
    let mut b = DocBuilder::new();
    let (mut fh, fp) = frame_free(SizeIntent::Fixed(400.0), SizeIntent::Fixed(300.0));
    fh.x = AxisBinding::start(0.0);
    let f = b.add(0, fh, fp);
    let mut h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    h.x = AxisBinding::Span { start: 0.0, end: 0.0 };
    h.y = AxisBinding::Span { start: 0.0, end: 0.0 };
    h.rotation = 30.0;
    let s = b.add(
        f,
        h,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let r = run(&b.build());
    assert_rect(r.box_of(s), 0.0, 0.0, 400.0, 300.0, "span box unbent by rotation");
    let aabb = r.aabb_of(s);
    assert!(aabb.w > 400.0 && aabb.h > 300.0, "corners swing outside");
}

/// Accumulation: 120 × 3° successive writes vs one 360° — same resolved
/// geometry within the platform tolerance (R-E4).
#[test]
fn rotation_accumulation_bounded() {
    let mut b = DocBuilder::new();
    let (h, p) = shape(100.0, 50.0);
    let s = b.add(0, h, p);
    let mut doc = b.build();
    for i in 1..=120 {
        anchor_lab::ops::set_rotation(&mut doc, s, i as f32 * 3.0).unwrap();
    }
    let r = run(&doc);
    let w = r.world_of(s);
    // 360°: bit-clean identity rotation per R-E1 quadrant rule
    assert_close(w.a, 1.0, "a");
    assert_close(w.b, 0.0, "b");
    // set-rotation is absolute, not incremental — no accumulation by design
    assert_eq!(doc.get(s).header.rotation, 360.0);
}

/// aspect_ratio resolves the axis, THEN rotation wraps the result —
/// the two features compose without ordering ambiguity.
#[test]
fn aspect_ratio_then_rotation() {
    let mut b = DocBuilder::new();
    let mut h = Header::new(SizeIntent::Fixed(160.0), SizeIntent::Auto);
    h.aspect_ratio = Some((16.0, 9.0));
    h.rotation = 90.0;
    let s = b.add(
        0,
        h,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let r = run(&b.build());
    let bx = r.box_of(s);
    assert_close(bx.w, 160.0, "aspect resolved w");
    assert_close(bx.h, 90.0, "aspect resolved h");
    let aabb = r.aabb_of(s);
    assert_close(aabb.w, 90.0, "then envelope swaps");
    assert_close(aabb.h, 160.0, "then envelope swaps");
}

/// Far-canvas: rotation at 1e6 offsets keeps the center exact within
/// f32 tolerance at that scale (N-1 smoke).
#[test]
fn far_canvas_rotation_center() {
    let mut b = DocBuilder::new();
    let (mut h, p) = shape(120.0, 80.0);
    h.x = AxisBinding::start(1.0e6);
    h.y = AxisBinding::start(1.0e6);
    h.rotation = 33.0;
    let s = b.add(0, h, p);
    let r = run(&b.build());
    let c = r.world_of(s).apply((60.0, 40.0));
    // f32 ULP at 1e6 is 0.0625 — allow a scaled tolerance
    assert!((c.0 - 1_000_060.0).abs() < 0.25, "center x at far canvas: {}", c.0);
    assert!((c.1 - 1_000_040.0).abs() < 0.25, "center y at far canvas: {}", c.1);
}

/// Census blocker fix: Span{0,0} (the canonical free-context fill) is a
/// wrap constraint — fill text re-wraps like Fixed/stretched widths.
#[test]
fn span_fill_text_rewraps() {
    let mut b = DocBuilder::new();
    let (mut fh, fp) = frame_free(SizeIntent::Fixed(100.0), SizeIntent::Fixed(200.0));
    fh.x = AxisBinding::start(0.0);
    let f = b.add(0, fh, fp);
    let mut th = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    th.x = AxisBinding::Span { start: 0.0, end: 0.0 };
    let t = b.add(
        f,
        th,
        Payload::Text {
            content: "aaaa bbbb cccc dddd".into(), // natural 114 @fs10
            font_size: 10.0,
        },
    );
    let r = run(&b.build());
    let bx = r.box_of(t);
    assert_close(bx.w, 100.0, "span fill width");
    // wraps at 100 (16 chars max): "aaaa bbbb cccc"(14) / "dddd" → 2 lines
    assert_close(bx.h, 24.0, "fill text re-wraps");
}

/// Census fix: nested derived unions keep the inner union offset — a
/// group-in-group's content lands where the coordinates say (D-E2 depth).
#[test]
fn nested_group_union_offset_exact() {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(100.0);
    gh.y = AxisBinding::start(50.0);
    let g = b.add(0, gh, Payload::Group);
    let h = b.add(g, Header::new(SizeIntent::Auto, SizeIntent::Auto), Payload::Group);
    let (mut sh, sp) = shape(40.0, 40.0);
    sh.x = AxisBinding::start(20.0);
    let s = b.add(h, sh, sp);
    let r = run(&b.build());
    let p = r.world_of(s).apply((0.0, 0.0));
    assert_close(p.0, 120.0, "inner offset survives nesting");
    assert_close(p.1, 50.0, "y exact");
}

/// Census fix: ungroup with a NESTED group child preserves world
/// transforms (D-4 for derived children — origin bake, not center bake).
#[test]
fn ungroup_nested_group_preserves_world() {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(100.0);
    gh.y = AxisBinding::start(50.0);
    gh.rotation = 30.0;
    let g = b.add(0, gh, Payload::Group);
    let h = b.add(g, Header::new(SizeIntent::Auto, SizeIntent::Auto), Payload::Group);
    let (mut s1h, s1p) = shape(40.0, 40.0);
    s1h.x = AxisBinding::start(20.0);
    let s1 = b.add(h, s1h, s1p);
    let (mut s2h, s2p) = shape(40.0, 40.0);
    s2h.x = AxisBinding::start(80.0);
    let s2 = b.add(h, s2h, s2p);
    let mut doc = b.build();
    let before = run(&doc);
    let w1 = before.world_of(s1);
    let w2 = before.world_of(s2);
    anchor_lab::ops::ungroup(&mut doc, &before, g).unwrap();
    let after = run(&doc);
    for (id, w) in [(s1, w1), (s2, w2)] {
        let v = after.world_of(id);
        for (a, e) in [(v.a,w.a),(v.b,w.b),(v.c,w.c),(v.d,w.d),(v.e,w.e),(v.f,w.f)] {
            assert!((a - e).abs() < 1e-3, "nested bake exact: {a} vs {e}");
        }
    }
}

/// Census fix: a hug frame wraps a rotated GROUP by its true origin-pivot
/// envelope, not a center-concentric approximation.
#[test]
fn hug_wraps_rotated_group_exactly() {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_free(SizeIntent::Auto, SizeIntent::Auto);
    let f = b.add(0, fh, fp);
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.rotation = 90.0;
    let g = b.add(f, gh, Payload::Group);
    let (sh, sp) = shape(100.0, 20.0);
    b.add(g, sh, sp);
    let doc = b.build();
    let r = run(&doc);
    // origin pivot at (0,0): the 100×20 bar rotates into x∈[−20,0], y∈[0,100]
    // → hug covers max extents (clamped at 0 origin): w = 0, h = 100…
    // declared: hug covers positive extents; the frame is 0-wide? No —
    // the AABB max_x = 0 → w=0 is degenerate but honest; assert h.
    assert_close(r.box_of(f).h, 100.0, "hug height = true envelope");
    assert!(r.box_of(f).w < 1.0, "no phantom width from the wrong pivot");
}

/// R-E3: −0.0 canonicalizes at the write boundary.
#[test]
fn negative_zero_rotation_canonicalized() {
    let mut b = DocBuilder::new();
    let (h, p) = shape(50.0, 50.0);
    let s = b.add(0, h, p);
    let mut doc = b.build();
    anchor_lab::ops::set_rotation(&mut doc, s, -0.0).unwrap();
    assert!(doc.get(s).header.rotation.is_sign_positive(), "−0.0 never stored");
}
