use super::*;
use cg::vectornetwork::*;
use math2::transform::AffineTransform;

pub fn build() -> Scene {
    let rectangle = rect(0.0, 0.0, 200.0, 100.0, solid(220, 59, 59, 255));

    let ell = ellipse(220.0, 10.0, 100.0, 80.0, solid(59, 100, 220, 255));

    let polygon = Node::RegularPolygon(RegularPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(340.0, 0.0, 100.0, 100.0, 0.0),
        size: Size { width: 100.0, height: 100.0 },
        point_count: 6,
        corner_radius: 5.0,
        fills: Paints::new(vec![solid(59, 180, 75, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    });

    let star = Node::RegularStarPolygon(RegularStarPolygonNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(460.0, 0.0, 120.0, 120.0, 0.0),
        size: Size { width: 120.0, height: 120.0 },
        point_count: 5,
        inner_radius: 0.4,
        corner_radius: 3.0,
        fills: Paints::new(vec![solid(255, 200, 40, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    });

    let ln = line(0.0, 140.0, 200.0, 0.0, 2.0);

    let txt = text(220.0, 130.0, "Hello, Grida!", 20.0, 400);

    let vector = Node::Vector(VectorNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(460.0, 130.0, 100.0, 100.0, 0.0),
        network: VectorNetwork {
            vertices: vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
            segments: vec![
                VectorNetworkSegment { a: 0, b: 1, ta: (30.0, 0.0), tb: (-30.0, 0.0) },
                VectorNetworkSegment { a: 1, b: 2, ta: (0.0, 30.0), tb: (0.0, -30.0) },
                VectorNetworkSegment { a: 2, b: 3, ta: (-30.0, 0.0), tb: (30.0, 0.0) },
                VectorNetworkSegment { a: 3, b: 0, ta: (0.0, -30.0), tb: (0.0, 30.0) },
            ],
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
                fill_rule: FillRule::EvenOdd,
                fills: None,
            }],
        },
        corner_radius: 0.0,
        fills: Paints::new(vec![solid(128, 60, 200, 255)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_width: 1.0,
        stroke_width_profile: None,
        stroke_align: StrokeAlign::Center,
        stroke_cap: StrokeCap::Butt,
        stroke_join: StrokeJoin::Miter,
        stroke_miter_limit: StrokeMiterLimit(4.0),
        stroke_dash_array: None,
        marker_start_shape: StrokeMarkerPreset::None,
        marker_end_shape: StrokeMarkerPreset::None,
        layout_child: None,
    });

    flat_scene("L0 Shapes", vec![rectangle, ell, polygon, star, ln, txt, vector])
}
