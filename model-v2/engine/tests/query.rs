//! ENG-3 · the query facade fronts the lab narrowphase without changing what
//! is selected: `hit_point` equals `anchor_lab::pick::pick` at every point of
//! a sweep (the walk is the oracle), and `nodes_in_rect` finds AABB overlaps.

use anchor_engine::query::Query;
use anchor_lab::math::RectF;
use anchor_lab::model::*;
use anchor_lab::pick::pick;
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (1000.0, 1000.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    }
}

/// root with two free shapes and a group of one rect, at spread positions.
fn scene() -> (Document, NodeId, NodeId, NodeId) {
    let mut b = DocBuilder::new();

    let (mut s1h, s1p) = (
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(40.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    s1h.x = AxisBinding::start(50.0);
    s1h.y = AxisBinding::start(50.0);
    let s1 = b.add(0, s1h, s1p);

    let (mut s2h, s2p) = (
        Header::new(SizeIntent::Fixed(60.0), SizeIntent::Fixed(30.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    s2h.x = AxisBinding::start(200.0);
    s2h.y = AxisBinding::start(120.0);
    let s2 = b.add(0, s2h, s2p);

    let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    gh.x = AxisBinding::start(400.0);
    gh.y = AxisBinding::start(400.0);
    let g = b.add(0, gh, Payload::Group);
    b.add(
        g,
        Header::new(SizeIntent::Fixed(50.0), SizeIntent::Fixed(50.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );

    (b.build(), s1, s2, g)
}

#[test]
fn hit_point_matches_pick_over_grid() {
    let (doc, ..) = scene();
    let r = resolve(&doc, &opts());
    let q = Query::new(&doc, &r);

    let mut gx = 0.0;
    while gx <= 500.0 {
        let mut gy = 0.0;
        while gy <= 500.0 {
            assert_eq!(
                q.hit_point(gx, gy),
                pick(&doc, &r, gx, gy),
                "hit_point must equal pick at ({gx},{gy})"
            );
            gy += 15.0;
        }
        gx += 15.0;
    }
}

#[test]
fn nodes_in_rect_selects_overlaps() {
    let (doc, s1, ..) = scene();
    let r = resolve(&doc, &opts());
    let q = Query::new(&doc, &r);

    let near = q.nodes_in_rect(RectF {
        x: 45.0,
        y: 45.0,
        w: 20.0,
        h: 20.0,
    });
    assert!(near.contains(&s1), "rect over s1 should include s1");

    let far = q.nodes_in_rect(RectF {
        x: 900.0,
        y: 10.0,
        w: 5.0,
        h: 5.0,
    });
    assert!(!far.contains(&s1), "rect far from s1 should not include s1");
}
