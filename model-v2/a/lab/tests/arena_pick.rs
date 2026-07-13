//! Part-1 spike surface: the node arena's structural APIs, the delete op,
//! and hit-testing (`pick`) over the resolved SOA tier.

use anchor_lab::model::*;
use anchor_lab::ops;
use anchor_lab::pick::pick;
use anchor_lab::resolve::{resolve, ResolveOptions};

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 800.0),
        ..Default::default()
    }
}

fn card(w: f32, h: f32) -> (Header, Payload) {
    (
        Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    )
}

fn at(mut h: Header, x: f32, y: f32) -> Header {
    h.x = AxisBinding::start(x);
    h.y = AxisBinding::start(y);
    h
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

// ---- arena structural APIs -------------------------------------------

#[test]
fn parent_links_survive_structural_ops() {
    let mut b = DocBuilder::new();
    let (fh, fp) = flex_row(460.0, 170.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(10.0);
    gh.y = AxisBinding::start(10.0);
    let g = b.add(0, gh, Payload::Group);
    let (ch, cp) = card(40.0, 40.0);
    let a = b.add(g, ch, cp);
    let mut doc = b.build();

    assert_eq!(doc.parent_of(f), Some(0));
    assert_eq!(doc.parent_of(a), Some(g));

    // ungroup re-homes the child's parent link to the group's parent
    let r = resolve(&doc, &opts());
    ops::ungroup(&mut doc, &r, g).unwrap();
    assert_eq!(doc.parent_of(a), Some(0));
    assert!(doc.get_opt(g).is_none());
}

#[test]
fn delete_removes_subtree_and_reflows() {
    let mut b = DocBuilder::new();
    let (fh, fp) = flex_row(460.0, 170.0);
    let f = b.add(0, at(fh, 20.0, 20.0), fp);
    let mut ids = vec![];
    for _ in 0..3 {
        let (ch, cp) = card(60.0, 100.0);
        ids.push(b.add(f, ch, cp));
    }
    let mut doc = b.build();
    let r0 = resolve(&doc, &opts());
    let slot1_x = r0.box_of(ids[1]).x;

    let n = ops::delete(&mut doc, ids[1]).unwrap();
    assert_eq!(n, 1);
    assert!(doc.get_opt(ids[1]).is_none());

    // the row reflows: c takes the deleted slot
    let r1 = resolve(&doc, &opts());
    assert_eq!(r1.box_of(ids[2]).x, slot1_x);

    // the root is a wall
    let root = doc.root;
    assert_eq!(ops::delete(&mut doc, root), Err(ops::OpError::WrongKind));
    // and double-delete is typed, not a panic
    assert_eq!(ops::delete(&mut doc, ids[1]), Err(ops::OpError::WrongKind));
}

#[test]
fn delete_is_subtree_deep() {
    let mut b = DocBuilder::new();
    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(100.0);
    gh.y = AxisBinding::start(100.0);
    let g = b.add(0, gh, Payload::Group);
    let (c1h, c1p) = card(40.0, 40.0);
    let a = b.add(g, c1h, c1p);
    let (mut c2h, c2p) = card(40.0, 40.0);
    c2h.x = AxisBinding::start(60.0);
    let s = b.add(g, c2h, c2p);
    let mut doc = b.build();

    let n = ops::delete(&mut doc, g).unwrap();
    assert_eq!(n, 3, "group + both members");
    for id in [g, a, s] {
        assert!(doc.get_opt(id).is_none());
    }
}

// ---- pick --------------------------------------------------------------

#[test]
fn pick_is_oriented_not_aabb() {
    let mut b = DocBuilder::new();
    let (mut ch, cp) = card(120.0, 24.0);
    ch = at(ch, 200.0, 200.0);
    ch.rotation = 45.0;
    let id = b.add(0, ch, cp);
    let doc = b.build();
    let r = resolve(&doc, &opts());

    // box center always hits
    let (cx, cy) = (260.0, 212.0);
    assert_eq!(pick(&r, cx, cy), Some(id));
    // a point inside the AABB but OUTSIDE the oriented box must miss
    // (thin 45deg bar: the AABB corner region is empty space)
    let aabb = r.aabb_of(id);
    let corner = (aabb.x + 4.0, aabb.y + 4.0);
    assert_eq!(pick(&r, corner.0, corner.1), Some(doc.root));
}

#[test]
fn pick_topmost_wins() {
    let mut b = DocBuilder::new();
    let (c1, p1) = card(100.0, 100.0);
    let under = b.add(0, at(c1, 100.0, 100.0), p1);
    let (c2, p2) = card(100.0, 100.0);
    let over = b.add(0, at(c2, 150.0, 150.0), p2);
    let doc = b.build();
    let r = resolve(&doc, &opts());
    // overlap region: later sibling paints on top and wins the pick
    assert_eq!(pick(&r, 175.0, 175.0), Some(over));
    // non-overlapped part of the lower one still hits it
    assert_eq!(pick(&r, 110.0, 110.0), Some(under));
}

#[test]
fn pick_promotes_to_outermost_group() {
    let mut b = DocBuilder::new();
    let mut outer_h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    outer_h.x = AxisBinding::start(100.0);
    outer_h.y = AxisBinding::start(100.0);
    let outer = b.add(0, outer_h, Payload::Group);
    let inner_h = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    let inner = b.add(outer, inner_h, Payload::Group);
    let (ch, cp) = card(50.0, 50.0);
    let leaf = b.add(inner, ch, cp);
    let doc = b.build();
    let r = resolve(&doc, &opts());
    let _ = (inner, leaf);
    // clicking the leaf's ink selects the OUTERMOST group
    assert_eq!(pick(&r, 120.0, 120.0), Some(outer));
}

#[test]
fn pick_hits_lens_content_post_ops() {
    let mut b = DocBuilder::new();
    let mut lh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    lh.x = AxisBinding::start(300.0);
    lh.y = AxisBinding::start(300.0);
    let l = b.add(
        0,
        lh,
        Payload::Lens {
            ops: vec![LensOp::Translate { x: 200.0, y: 0.0 }],
        },
    );
    let (ch, cp) = card(60.0, 60.0);
    b.add(l, ch, cp);
    let doc = b.build();
    let r = resolve(&doc, &opts());

    // the PRE-ops position is empty space (ops moved the ink away)...
    assert_eq!(pick(&r, 330.0, 330.0), Some(doc.root));
    // ...the POST-ops position hits, and promotes to the lens
    assert_eq!(pick(&r, 530.0, 330.0), Some(l));
}

#[test]
fn pick_hairline_line_is_grabbable() {
    let mut b = DocBuilder::new();
    let mut lh = Header::new(SizeIntent::Fixed(200.0), SizeIntent::Fixed(0.0));
    lh = at(lh, 100.0, 400.0);
    let line = b.add(
        0,
        lh,
        Payload::Shape {
            desc: ShapeDesc::Line,
        },
    );
    let doc = b.build();
    let r = resolve(&doc, &opts());
    assert_eq!(pick(&r, 180.0, 401.5), Some(line));
}

#[test]
fn pick_respects_the_exact_transformed_clip_of_every_ancestor() {
    let mut b = DocBuilder::new();
    let mut clip_header = Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(100.0));
    clip_header = at(clip_header, 200.0, 200.0);
    clip_header.rotation = 45.0;
    let clip = b.add(
        0,
        clip_header,
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: true,
        },
    );
    let (child_header, child_payload) = card(40.0, 40.0);
    let child = b.add(clip, at(child_header, 80.0, 20.0), child_payload);
    let doc = b.build();
    let r = resolve(&doc, &opts());

    let inside_clip = r.world_of(child).apply((10.0, 10.0));
    assert_eq!(
        pick(&r, inside_clip.0, inside_clip.1),
        Some(child),
        "the visible part of the child remains pickable"
    );

    let outside_clip = r.world_of(child).apply((30.0, 10.0));
    assert_eq!(
        pick(&r, outside_clip.0, outside_clip.1),
        Some(doc.root),
        "the child is not pickable through its rotated ancestor clip"
    );
}
