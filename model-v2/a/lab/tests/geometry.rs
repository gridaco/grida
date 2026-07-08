//! G-* — geometry resolution across the binding/size vocabulary.

mod common;
use common::*;

use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, Report};

fn one_child(parent_w: f32, parent_h: f32, h: Header, p: Payload) -> (Document, NodeId) {
    let mut b = DocBuilder::new();
    let (mut fh, fp) = frame_free(SizeIntent::Fixed(parent_w), SizeIntent::Fixed(parent_h));
    fh.x = AxisBinding::start(0.0);
    fh.y = AxisBinding::start(0.0);
    let f = b.add(0, fh, fp);
    let c = b.add(f, h, p);
    (b.build(), c)
}

/// G-1: the §2.1 resolution table, exact arithmetic.
#[test]
fn g1_binding_table_exact() {
    // Pin{Start, 10} → x0 = 10
    let (mut h, p) = shape(120.0, 80.0);
    h.x = AxisBinding::start(10.0);
    let (doc, c) = one_child(400.0, 300.0, h, p.clone());
    assert_close(run(&doc).box_of(c).x, 10.0, "start");

    // Pin{End, 24} → x0 = 400 − 24 − 120 = 256
    let (mut h, _) = shape(120.0, 80.0);
    h.x = AxisBinding::end(24.0);
    let (doc, c) = one_child(400.0, 300.0, h, p.clone());
    assert_close(run(&doc).box_of(c).x, 256.0, "end");

    // Pin{Center, 6} → x0 = (400 − 120)/2 + 6 = 146
    let (mut h, _) = shape(120.0, 80.0);
    h.x = AxisBinding::center(6.0);
    let (doc, c) = one_child(400.0, 300.0, h, p.clone());
    assert_close(run(&doc).box_of(c).x, 146.0, "center");

    // Span{30, 50} → x0 = 30, w = 400 − 30 − 50 = 320 (SizeIntent ignored)
    let (mut h, _) = shape(120.0, 80.0);
    h.x = AxisBinding::Span {
        start: 30.0,
        end: 50.0,
    };
    let (doc, c) = one_child(400.0, 300.0, h, p);
    let b = run(&doc).box_of(c);
    assert_close(b.x, 30.0, "span x");
    assert_close(b.w, 320.0, "span extent owns axis");
}

/// G-2: end-anchored intent survives parent resize — "right: 24" stays 24.
#[test]
fn g2_end_intent_survives_parent_resize() {
    let (mut h, p) = shape(120.0, 80.0);
    h.x = AxisBinding::end(24.0);
    let (mut doc, c) = one_child(400.0, 300.0, h, p);
    let r1 = run(&doc);
    assert_close(r1.box_of(c).x + 120.0 + 24.0, 400.0, "gap=24 @400");

    // parent grows: same document field, re-resolved
    let f = doc.parent_of(c).unwrap();
    doc.get_mut(f).header.width = SizeIntent::Fixed(640.0);
    let r2 = run(&doc);
    assert_close(r2.box_of(c).x + 120.0 + 24.0, 640.0, "gap=24 @640");
}

/// G-5: aspect-ratio resolves the under-specified axis only.
#[test]
fn g5_aspect_resolves_underspecified_axis() {
    let mut h = Header::new(SizeIntent::Fixed(160.0), SizeIntent::Auto);
    h.aspect_ratio = Some((16.0, 9.0));
    let (doc, c) = one_child(
        400.0,
        300.0,
        h,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let r = run(&doc);
    assert_close(r.box_of(c).h, 90.0, "h from 16:9");
    // and no error-by-rule fired for the auto axis
    assert!(
        !r.reports.iter().any(|rep| matches!(
            rep,
            Report::ErrorByRule { node, .. } if *node == c
        )),
        "aspect resolved the axis"
    );
}

/// G-E1: zero-size parent — end/center anchors resolve, no NaN anywhere.
#[test]
fn ge1_zero_size_parent_no_nan() {
    let (mut h, p) = shape(120.0, 80.0);
    h.x = AxisBinding::end(24.0);
    h.y = AxisBinding::center(0.0);
    let (doc, c) = one_child(0.0, 0.0, h, p);
    let b = run(&doc).box_of(c);
    assert!(b.x.is_finite() && b.y.is_finite());
    assert_close(b.x, -144.0, "end vs zero parent"); // 0 − 24 − 120
    assert_close(b.y, -40.0, "center vs zero parent"); // (0−80)/2
}

/// G-E2: span offsets exceeding the parent — declared clamp-to-zero,
/// reported, never a negative-width box downstream.
#[test]
fn ge2_negative_span_clamps_reported() {
    let (mut h, p) = shape(120.0, 80.0);
    h.x = AxisBinding::Span {
        start: 300.0,
        end: 200.0,
    };
    let (doc, c) = one_child(400.0, 300.0, h, p);
    let r = run(&doc);
    assert_close(r.box_of(c).w, 0.0, "clamped to zero");
    assert!(
        r.reports
            .iter()
            .any(|rep| matches!(rep, Report::Clamped { node, .. } if *node == c)),
        "clamp reported, not silent"
    );
}

/// G-E3: Auto size on a kind with no natural size — declared error-by-rule,
/// never a silent 0-vs-unset ambiguity.
#[test]
fn ge3_auto_on_shape_is_error_by_rule() {
    let h = Header::new(SizeIntent::Auto, SizeIntent::Fixed(80.0));
    let (doc, c) = one_child(
        400.0,
        300.0,
        h,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let r = run(&doc);
    assert!(
        r.reports.iter().any(|rep| matches!(
            rep,
            Report::ErrorByRule { node, field: "width", .. } if *node == c
        )),
        "typed error surfaced"
    );
}

/// G-4: min/max clamp applied after size resolution; min beats max.
#[test]
fn g4_min_max_clamp_declared() {
    let (mut h, p) = shape(120.0, 80.0);
    h.min_width = Some(200.0);
    h.max_width = Some(150.0);
    let (doc, c) = one_child(400.0, 300.0, h, p);
    // min wins over max (declared G-4 rule)
    assert_close(run(&doc).box_of(c).w, 200.0, "min beats max");
}

/// Root regularization (X-SELF-5 break): the scene root is an ordinary
/// frame; Span{0,0} bindings make it exactly the viewport.
#[test]
fn root_is_viewport_bound_frame() {
    let b = DocBuilder::new();
    let doc = b.build();
    let r = resolve(&doc, &opts());
    assert_rect(
        r.box_of(doc.root),
        0.0,
        0.0,
        1000.0,
        1000.0,
        "root=viewport",
    );
}
