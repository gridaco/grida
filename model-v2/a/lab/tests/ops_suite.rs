//! M-* / editor.md doctrine — typed errors, write counts, M-6 atomicity.

mod common;
use common::*;

use anchor_lab::model::*;
use anchor_lab::ops::{self, OpError};

fn free_shape_doc() -> (Document, NodeId) {
    let mut b = DocBuilder::new();
    let (mut h, p) = shape(120.0, 80.0);
    h.x = AxisBinding::start(10.0);
    h.y = AxisBinding::start(20.0);
    let s = b.add(0, h, p);
    (b.build(), s)
}

/// editor.md write-count doctrine: the gesture table is enforced.
#[test]
fn write_counts_match_doctrine() {
    // rotate (boxed) = 1
    let (mut doc, s) = free_shape_doc();
    assert_eq!(ops::set_rotation(&mut doc, s, 30.0).unwrap(), 1);

    // move = 2
    let (mut doc, s) = free_shape_doc();
    let r = run(&doc);
    assert_eq!(ops::move_by(&mut doc, &r, s, 5.0, 5.0).unwrap(), 2);

    // corner resize = 4
    let (mut doc, s) = free_shape_doc();
    let r = run(&doc);
    assert_eq!(
        ops::resize_top_left(&mut doc, &r, s, 0.0, 0.0, 150.0, 100.0).unwrap(),
        4
    );

    // group center-feel rotate = 3 (asserted in rotation.rs too)
}

/// Writes re-target intent: setting x on an End-pinned axis rewrites the
/// end offset so the resolved x equals the given value — the binding kind
/// (the user's intent) is preserved.
#[test]
fn set_x_retargets_end_pin() {
    let mut b = DocBuilder::new();
    let (mut fh, fp) = frame_free(SizeIntent::Fixed(400.0), SizeIntent::Fixed(300.0));
    fh.x = AxisBinding::start(0.0);
    let f = b.add(0, fh, fp);
    let (mut h, p) = shape(120.0, 80.0);
    h.x = AxisBinding::end(24.0); // resolved x = 256
    let s = b.add(f, h, p);
    let mut doc = b.build();
    let r = run(&doc);

    assert_eq!(ops::set_x(&mut doc, &r, s, 200.0).unwrap(), 1);
    // intent preserved:
    assert!(matches!(
        doc.get(s).header.x,
        AxisBinding::Pin {
            anchor: AnchorEdge::End,
            ..
        }
    ));
    // and effective:
    let r2 = run(&doc);
    assert_close(r2.box_of(s).x, 200.0, "resolved x = requested");
    // offset now 400 − 200 − 120 = 80
    if let AxisBinding::Pin { offset, .. } = doc.get(s).header.x {
        assert_close(offset, 80.0, "end offset rewritten");
    }
}

/// Typed error: G-3 over-constraint is unrepresentable; the write that
/// would create it is rejected as AxisOwnedBySpan.
#[test]
fn set_width_on_spanned_axis_typed_error() {
    let mut b = DocBuilder::new();
    let (mut h, p) = shape(120.0, 80.0);
    h.x = AxisBinding::Span {
        start: 10.0,
        end: 20.0,
    };
    let s = b.add(0, h, p);
    let mut doc = b.build();
    let before = doc.clone();
    assert_eq!(
        ops::set_width(&mut doc, s, 300.0),
        Err(OpError::AxisOwnedBySpan)
    );
    assert_eq!(doc, before, "M-6: rejected write leaves document identical");
}

/// Typed error: x-write on an in-flow child under flex (§6).
#[test]
fn set_x_under_flow_typed_error() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Fixed(300.0),
        SizeIntent::Fixed(100.0),
        Direction::Row,
        0.0,
        0.0,
    );
    let f = b.add(0, h, p);
    let (h1, p1) = shape(50.0, 50.0);
    let a = b.add(f, h1, p1);
    let mut doc = b.build();
    let r = run(&doc);
    let before = doc.clone();
    assert_eq!(
        ops::set_x(&mut doc, &r, a, 99.0),
        Err(OpError::OwnedByLayout)
    );
    assert_eq!(doc, before, "M-6");
}

/// R-E3 / N-2: NaN/Inf rejected at the write boundary with a typed error;
/// the document stays NaN-free by construction.
#[test]
fn nan_rejected_at_write_boundary() {
    let (mut doc, s) = free_shape_doc();
    let before = doc.clone();
    assert_eq!(
        ops::set_rotation(&mut doc, s, f32::NAN),
        Err(OpError::InvalidNumber)
    );
    assert_eq!(
        ops::set_width(&mut doc, s, f32::INFINITY),
        Err(OpError::InvalidNumber)
    );
    assert_eq!(doc, before, "M-6");
}

/// Typed error: size writes on derived-box kinds.
#[test]
fn set_width_on_group_typed_error() {
    let mut b = DocBuilder::new();
    let g = b.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Group,
    );
    let (h1, p1) = shape(40.0, 40.0);
    b.add(g, h1, p1);
    let mut doc = b.build();
    assert_eq!(ops::set_width(&mut doc, g, 100.0), Err(OpError::BoxDerived));
}

/// C-1/C-2 shape (executable H3): move ∥ rotate and resize ∥ rotate touch
/// disjoint scalar fields — a field-level merge preserves both intents.
#[test]
fn concurrency_atoms_disjoint_fields() {
    let (doc, s) = free_shape_doc();

    // replica A: move
    let mut da = doc.clone();
    let ra = run(&da);
    ops::move_by(&mut da, &ra, s, 30.0, 0.0).unwrap();

    // replica B: rotate
    let mut db = doc.clone();
    ops::set_rotation(&mut db, s, 45.0).unwrap();

    // field-level merge (x/y from A, rotation from B)
    let mut merged = doc.clone();
    merged.get_mut(s).header.x = da.get(s).header.x;
    merged.get_mut(s).header.y = da.get(s).header.y;
    merged.get_mut(s).header.rotation = db.get(s).header.rotation;

    let rm = run(&merged);
    let b = rm.box_of(s);
    assert_close(b.x, 40.0, "move survived");
    assert_eq!(merged.get(s).header.rotation, 45.0, "rotation survived");
    // merged document is valid — resolution succeeds with no error reports
    assert!(rm
        .reports
        .iter()
        .all(|r| !matches!(r, anchor_lab::resolve::Report::ErrorByRule { .. })));
}
