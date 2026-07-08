//! L-* / T-* — flex behavior, hug, measured content, the §7 quartet (c).

mod common;
use common::*;

use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, Report};

/// L-3: hug container with mixed fixed/grow children — no cycle; grow
/// distributes only definite free space (of which a hug container has none).
#[test]
fn l3_hug_with_grow_no_cycle() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Fixed(100.0),
        Direction::Row,
        0.0,
        0.0,
    );
    let f = b.add(0, h, p);
    let (h1, p1) = shape(50.0, 50.0);
    let a = b.add(f, h1, p1);
    let (mut h2, p2) = shape(70.0, 50.0);
    h2.grow = 1.0;
    let g = b.add(f, h2, p2);
    let doc = b.build();
    let r = run(&doc);
    // hug = sum of basis sizes; grow had no free space to distribute
    assert_close(r.box_of(f).w, 120.0, "hug from basis sizes");
    assert_close(r.box_of(a).w, 50.0, "fixed child");
    assert_close(r.box_of(g).w, 70.0, "grow child stays at basis under hug");
}

/// grow distributes definite free space (fixed container).
#[test]
fn grow_distributes_definite_free_space() {
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
    b.add(f, h1, p1);
    let (mut h2, p2) = shape(70.0, 50.0);
    h2.grow = 1.0;
    let g = b.add(f, h2, p2);
    let doc = b.build();
    let r = run(&doc);
    assert_close(r.box_of(g).w, 250.0, "70 + (300−120) free");
}

/// L-4: absolute child inside a flex parent — excluded from flow,
/// resolves against the parent box.
#[test]
fn l4_absolute_child_in_flex() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Fixed(300.0),
        SizeIntent::Fixed(100.0),
        Direction::Row,
        10.0,
        10.0,
    );
    let f = b.add(0, h, p);
    let (h1, p1) = shape(50.0, 50.0);
    let a = b.add(f, h1, p1);
    let (mut h2, p2) = shape(40.0, 40.0);
    h2.flow = Flow::Absolute;
    h2.x = AxisBinding::end(8.0);
    h2.y = AxisBinding::start(4.0);
    let abs = b.add(f, h2, p2);
    let (h3, p3) = shape(50.0, 50.0);
    let c = b.add(f, h3, p3);
    let doc = b.build();
    let r = run(&doc);
    // flow children ignore the absolute one
    assert_close(r.box_of(a).x, 10.0, "first flow child");
    assert_close(r.box_of(c).x, 70.0, "second flow child (no slot for abs)");
    // absolute resolves against the parent box
    assert_close(r.box_of(abs).x, 300.0 - 8.0 - 40.0, "end-pinned in parent");
    assert_close(r.box_of(abs).y, 4.0, "start-pinned in parent");
}

/// L-5 / §7(c): measured child re-measures at the layout-imposed width —
/// text stretched by cross-align re-wraps.
#[test]
fn l5_text_rewraps_at_stretched_width() {
    let mut b = DocBuilder::new();
    let (h, p) = {
        let (mut h, p) = frame_flex(
            SizeIntent::Fixed(100.0),
            SizeIntent::Auto,
            Direction::Column,
            8.0,
            0.0,
        );
        if let Payload::Frame { layout, .. } = &p {
            let mut l = *layout;
            l.cross_align = CrossAlign::Stretch;
            (
                h.clone(),
                Payload::Frame {
                    layout: l,
                    clips_content: false,
                },
            )
        } else {
            unreachable!()
        }
    };
    let f = b.add(0, h, p);
    // 10 chars/word world: "aaaa bbbb cccc" @10 → cw 6
    let th = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    let t = b.add(
        f,
        th,
        Payload::Text {
            content: "aaaa bbbb cccc".into(),
            font_size: 10.0,
        },
    );
    let doc = b.build();
    let r = run(&doc);
    // stretched to container width 100 → 16 chars max → "aaaa bbbb cccc" is
    // 14 chars → fits one line? 14*6=84 ≤ 100 → 1 line, h=12
    assert_close(r.box_of(t).w, 100.0, "stretched to container");
    assert_close(r.box_of(t).h, 12.0, "single line at 100");

    // narrower container → re-wrap
    let mut doc2 = doc.clone();
    doc2.get_mut(f).header.width = SizeIntent::Fixed(60.0);
    let r2 = run(&doc2);
    // 60/6 = 10 chars: "aaaa bbbb"(9) / "cccc" → 2 lines
    assert_close(r2.box_of(t).h, 24.0, "re-wrapped at 60");
}

/// T-1: fixed-width text wraps; auto-width text measures single-line.
#[test]
fn t1_text_measurement_modes() {
    let mut b = DocBuilder::new();
    let (fh, fp) = frame_free(SizeIntent::Fixed(500.0), SizeIntent::Fixed(500.0));
    let f = b.add(0, fh, fp);

    let auto_h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    let t_auto = b.add(
        f,
        auto_h,
        Payload::Text {
            content: "hello world".into(),
            font_size: 10.0,
        },
    );
    let fixed_h = Header::new(SizeIntent::Fixed(36.0), SizeIntent::Auto);
    let t_fixed = b.add(
        f,
        fixed_h,
        Payload::Text {
            content: "hello world".into(),
            font_size: 10.0,
        },
    );
    let doc = b.build();
    let r = run(&doc);
    assert_close(r.box_of(t_auto).w, 66.0, "11 chars × 6");
    assert_close(r.box_of(t_auto).h, 12.0, "one line");
    assert_close(r.box_of(t_fixed).w, 36.0, "fixed width kept");
    assert_close(r.box_of(t_fixed).h, 24.0, "wrapped to two lines");
}

/// L-E1: empty container with padding + hug → size = padding box.
#[test]
fn le1_empty_hug_is_padding_box() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Auto,
        SizeIntent::Auto,
        Direction::Row,
        12.0,
        16.0,
    );
    let f = b.add(0, h, p);
    let doc = b.build();
    let r = run(&doc);
    assert_rect(r.box_of(f), 0.0, 0.0, 32.0, 32.0, "padding box");
}

/// L-E3/L-E4: overflow — children exceed the fixed parent; no implicit
/// shrink (X-SELF-8 keep: flex_shrink = 0), overflow geometry exact.
#[test]
fn le3_no_implicit_shrink_on_overflow() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Fixed(100.0),
        SizeIntent::Fixed(60.0),
        Direction::Row,
        0.0,
        0.0,
    );
    let f = b.add(0, h, p);
    let mut ids = vec![];
    for _ in 0..3 {
        let (h1, p1) = shape(50.0, 50.0);
        ids.push(b.add(f, h1, p1));
    }
    let doc = b.build();
    let r = run(&doc);
    for (i, id) in ids.iter().enumerate() {
        assert_close(r.box_of(*id).w, 50.0, "authored size kept");
        assert_close(r.box_of(*id).x, 50.0 * i as f32, "exact overflow geometry");
    }
}

/// §8 matrix enforcement: x/y writes are ignored-by-rule under flow and the
/// resolver *reports* it (never silent).
#[test]
fn applicability_x_ignored_under_flow_reported() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Fixed(300.0),
        SizeIntent::Fixed(100.0),
        Direction::Row,
        0.0,
        0.0,
    );
    let f = b.add(0, h, p);
    let (mut h1, p1) = shape(50.0, 50.0);
    h1.x = AxisBinding::start(77.0); // will be ignored: layout owns position
    let a = b.add(f, h1, p1);
    let doc = b.build();
    let r = run(&doc);
    assert_close(r.box_of(a).x, 0.0, "layout owns x");
    assert!(
        r.reports.iter().any(|rep| matches!(
            rep,
            Report::IgnoredByRule { node, field: "x/y", .. } if *node == a
        )),
        "ignored-by-rule reported"
    );
}

/// Nested flex: row-in-column, fixed sizes, exact positions.
#[test]
fn nested_flex_exact() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Fixed(300.0),
        SizeIntent::Auto,
        Direction::Column,
        10.0,
        0.0,
    );
    let outer = b.add(0, h, p);
    let (h2, p2) = frame_flex(SizeIntent::Auto, SizeIntent::Auto, Direction::Row, 5.0, 0.0);
    let inner = b.add(outer, h2, p2);
    let (s1h, s1p) = shape(40.0, 30.0);
    let s1 = b.add(inner, s1h, s1p);
    let (s2h, s2p) = shape(40.0, 30.0);
    let s2 = b.add(inner, s2h, s2p);
    let (s3h, s3p) = shape(100.0, 20.0);
    let s3 = b.add(outer, s3h, s3p);
    let doc = b.build();
    let r = run(&doc);
    assert_rect(r.box_of(inner), 0.0, 0.0, 85.0, 30.0, "inner hug 40+5+40");
    assert_close(r.box_of(s1).x, 0.0, "s1");
    assert_close(r.box_of(s2).x, 45.0, "s2");
    assert_close(r.box_of(s3).y, 40.0, "s3 after inner + gap");
    assert_close(r.box_of(outer).h, 60.0, "outer hug 30+10+20");
}

/// MM-8 analogue is N/A (no camera in the lab); viewport-bound root reacts,
/// free content doesn't — covered in mm_laws. This test pins the L-7 POL:
/// resolution is unquantized (no pixel snapping in the resolved tier).
#[test]
fn l7_resolution_unquantized() {
    let mut b = DocBuilder::new();
    let (h, p) = frame_flex(
        SizeIntent::Fixed(100.0),
        SizeIntent::Fixed(30.0),
        Direction::Row,
        0.0,
        0.0,
    );
    let f = b.add(0, h, p);
    for _ in 0..3 {
        let (mut h1, p1) = shape(10.0, 10.0);
        h1.grow = 1.0;
        b.add(f, h1, p1);
    }
    let doc = b.build();
    let r = run(&doc);
    let kids: Vec<_> = doc.get(f).children.clone();
    // 100 − 30 = 70 free / 3 = 23.333… — fractional, unsnapped
    let w = r.box_of(kids[0]).w;
    assert!((w - 33.333332).abs() < 1e-3, "fractional width kept: {w}");
    let _ = resolve(&doc, &opts_visual()); // both modes agree here
}
