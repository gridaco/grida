//! ENG-5.1 · the typed `Op` + `apply` dispatcher must never diverge from
//! the free functions they wrap — every variant applied both ways from the
//! same start must leave the same result AND the same document. This is the
//! guard that lets the journal/replay describe writes by `Op` alone.

mod common;
use common::{opts_visual, shape};

use anchor_lab::model::*;
use anchor_lab::ops::{self, Axis, Op, OpError, ResizeDrag};
use anchor_lab::resolve::{resolve, Resolved};

/// root (viewport frame) with a free shape `s` and a group `g` of two shapes.
/// Deterministic ids: s = 1, g = 2.
fn fresh() -> (Document, NodeId, NodeId) {
    let mut b = DocBuilder::new();
    let (mut sh, sp) = shape(80.0, 40.0);
    sh.x = AxisBinding::start(20.0);
    sh.y = AxisBinding::start(20.0);
    let s = b.add(0, sh, sp);

    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(200.0);
    gh.y = AxisBinding::start(60.0);
    let g = b.add(0, gh, Payload::Group);
    let (c1h, c1p) = shape(40.0, 40.0);
    b.add(g, c1h, c1p);
    let (mut c2h, c2p) = shape(40.0, 40.0);
    c2h.x = AxisBinding::start(56.0);
    b.add(g, c2h, c2p);

    (b.build(), s, g)
}

/// Apply `op` and the equivalent free call from the SAME start + SAME resolve;
/// assert identical result and identical resulting document.
fn check(label: &str, op: Op, free: impl Fn(&mut Document, &Resolved) -> ops::OpResult) {
    let (base, _, _) = fresh();
    let r = resolve(&base, &opts_visual());

    let mut d_apply = base.clone();
    let res_apply = ops::apply(&mut d_apply, &r, &op);

    let mut d_free = base.clone();
    let res_free = free(&mut d_free, &r);

    assert_eq!(res_apply, res_free, "{label}: result mismatch");
    assert!(d_apply == d_free, "{label}: document mismatch");
}

#[test]
fn apply_matches_free_fns() {
    let (base, s, g) = fresh();
    let r = resolve(&base, &opts_visual());

    check("set_x", Op::SetX { id: s, value: 44.0 }, |d, rr| {
        ops::set_x(d, rr, s, 44.0)
    });
    check("set_y", Op::SetY { id: s, value: 33.0 }, |d, rr| {
        ops::set_y(d, rr, s, 33.0)
    });
    check(
        "move_by",
        Op::MoveBy {
            id: s,
            dx: 10.0,
            dy: -7.0,
        },
        |d, rr| ops::move_by(d, rr, s, 10.0, -7.0),
    );
    check(
        "set_width",
        Op::SetWidth {
            id: s,
            value: 111.0,
        },
        |d, _| ops::set_width(d, s, 111.0),
    );
    check(
        "set_height",
        Op::SetHeight { id: s, value: 22.0 },
        |d, _| ops::set_height(d, s, 22.0),
    );
    check(
        "set_rotation",
        Op::SetRotation { id: s, deg: 17.0 },
        |d, _| ops::set_rotation(d, s, 17.0),
    );
    check(
        "rotate_derived_center_feel",
        Op::RotateDerivedCenterFeel { id: g, deg: 25.0 },
        |d, rr| ops::rotate_derived_center_feel(d, rr, g, 25.0),
    );
    check(
        "resize_top_left",
        Op::ResizeTopLeft {
            id: s,
            x: 5.0,
            y: 5.0,
            w: 60.0,
            h: 30.0,
        },
        |d, rr| ops::resize_top_left(d, rr, s, 5.0, 5.0, 60.0, 30.0),
    );
    check("ungroup", Op::Ungroup { id: g }, |d, rr| {
        ops::ungroup(d, rr, g)
    });
    check("delete", Op::Delete { id: s }, |d, _| ops::delete(d, s));

    // resize_drag past the fixed (right) edge — the cross-zero flip path.
    let drag = ResizeDrag::begin(&base, &r, s, Axis::X, AnchorEdge::End).unwrap();
    let b = r.box_of(s);
    let target = b.x + b.w + 30.0;
    check(
        "resize_drag",
        Op::ResizeDrag {
            id: s,
            drag,
            target,
        },
        move |d, rr| ops::resize_drag(d, rr, s, &drag, target),
    );
}

/// A rejected op must surface the SAME typed error both ways and leave the
/// document byte-untouched (M-6) — errors are deterministic no-ops.
#[test]
fn apply_surfaces_errors_like_free_fns() {
    let (base, _s, g) = fresh();
    let r = resolve(&base, &opts_visual());

    // Sizing a derived (group) box: BoxDerived, doc untouched.
    let mut d_apply = base.clone();
    let res_apply = ops::apply(&mut d_apply, &r, &Op::SetWidth { id: g, value: 50.0 });
    assert_eq!(res_apply, Err(OpError::BoxDerived));
    assert!(d_apply == base, "rejected op must not mutate the document");
}
