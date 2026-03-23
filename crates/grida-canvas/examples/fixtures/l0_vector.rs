use super::*;
use cg::cg::stroke_dasharray::StrokeDashArray;
use cg::vectornetwork::*;
use math2::transform::AffineTransform;

/// Vector network nodes: closed shape, open path, multi-region, variable-width stroke.
pub fn build() -> Scene {
    // Closed bezier quad (4 curved segments forming a rounded square)
    let closed = Node::Vector(VectorNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(0.0, 0.0, 100.0, 100.0, 0.0),
        network: VectorNetwork {
            vertices: vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
            segments: vec![
                VectorNetworkSegment {
                    a: 0,
                    b: 1,
                    ta: (30.0, 0.0),
                    tb: (-30.0, 0.0),
                },
                VectorNetworkSegment {
                    a: 1,
                    b: 2,
                    ta: (0.0, 30.0),
                    tb: (0.0, -30.0),
                },
                VectorNetworkSegment {
                    a: 2,
                    b: 3,
                    ta: (-30.0, 0.0),
                    tb: (30.0, 0.0),
                },
                VectorNetworkSegment {
                    a: 3,
                    b: 0,
                    ta: (0.0, -30.0),
                    tb: (0.0, 30.0),
                },
            ],
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
                fill_rule: FillRule::EvenOdd,
                fills: None,
            }],
        },
        corner_radius: 0.0,
        fills: Paints::new(vec![solid(59, 100, 220, 255)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_width: 1.5,
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

    // Open path (3 vertices, 2 segments, no region)
    let open = Node::Vector(VectorNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(140.0, 0.0, 120.0, 80.0, 0.0),
        network: VectorNetwork {
            vertices: vec![(0.0, 80.0), (60.0, 0.0), (120.0, 80.0)],
            segments: vec![
                VectorNetworkSegment {
                    a: 0,
                    b: 1,
                    ta: (20.0, -30.0),
                    tb: (-20.0, 10.0),
                },
                VectorNetworkSegment {
                    a: 1,
                    b: 2,
                    ta: (20.0, 10.0),
                    tb: (-20.0, -30.0),
                },
            ],
            regions: vec![],
        },
        corner_radius: 0.0,
        fills: Paints::new(vec![]),
        strokes: Paints::new(vec![solid(220, 59, 59, 255)]),
        stroke_width: 3.0,
        stroke_width_profile: None,
        stroke_align: StrokeAlign::Center,
        stroke_cap: StrokeCap::Round,
        stroke_join: StrokeJoin::Round,
        stroke_miter_limit: StrokeMiterLimit(4.0),
        stroke_dash_array: None,
        marker_start_shape: StrokeMarkerPreset::Circle,
        marker_end_shape: StrokeMarkerPreset::EquilateralTriangle,
        layout_child: None,
    });

    // Region with explicit fill + dashed stroke
    let region_fill = Node::Vector(VectorNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(0.0, 140.0, 100.0, 100.0, 0.0),
        network: VectorNetwork {
            vertices: vec![(50.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
            segments: vec![
                VectorNetworkSegment {
                    a: 0,
                    b: 1,
                    ta: (0.0, 0.0),
                    tb: (0.0, 0.0),
                },
                VectorNetworkSegment {
                    a: 1,
                    b: 2,
                    ta: (0.0, 0.0),
                    tb: (0.0, 0.0),
                },
                VectorNetworkSegment {
                    a: 2,
                    b: 0,
                    ta: (0.0, 0.0),
                    tb: (0.0, 0.0),
                },
            ],
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2])],
                fill_rule: FillRule::NonZero,
                fills: Some(Paints::new(vec![solid(255, 200, 40, 255)])),
            }],
        },
        corner_radius: 0.0,
        fills: Paints::new(vec![solid(59, 180, 75, 255)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_width: 2.0,
        stroke_width_profile: None,
        stroke_align: StrokeAlign::Center,
        stroke_cap: StrokeCap::Butt,
        stroke_join: StrokeJoin::Miter,
        stroke_miter_limit: StrokeMiterLimit(4.0),
        stroke_dash_array: Some(StrokeDashArray(vec![8.0, 4.0])),
        marker_start_shape: StrokeMarkerPreset::None,
        marker_end_shape: StrokeMarkerPreset::None,
        layout_child: None,
    });

    // Variable-width stroke profile
    let varwidth = Node::Vector(VectorNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(140.0, 140.0, 120.0, 80.0, 0.0),
        network: VectorNetwork {
            vertices: vec![(0.0, 40.0), (60.0, 0.0), (120.0, 40.0), (60.0, 80.0)],
            segments: vec![
                VectorNetworkSegment {
                    a: 0,
                    b: 1,
                    ta: (20.0, -20.0),
                    tb: (-20.0, 10.0),
                },
                VectorNetworkSegment {
                    a: 1,
                    b: 2,
                    ta: (20.0, 10.0),
                    tb: (-20.0, -20.0),
                },
                VectorNetworkSegment {
                    a: 2,
                    b: 3,
                    ta: (-20.0, 20.0),
                    tb: (20.0, -10.0),
                },
            ],
            regions: vec![],
        },
        corner_radius: 0.0,
        fills: Paints::new(vec![]),
        strokes: Paints::new(vec![solid(128, 60, 200, 255)]),
        stroke_width: 4.0,
        stroke_width_profile: Some(cg::cg::varwidth::VarWidthProfile {
            base: 2.0,
            stops: vec![
                cg::cg::varwidth::WidthStop { u: 0.0, r: 1.0 },
                cg::cg::varwidth::WidthStop { u: 0.5, r: 6.0 },
                cg::cg::varwidth::WidthStop { u: 1.0, r: 1.0 },
            ],
        }),
        stroke_align: StrokeAlign::Center,
        stroke_cap: StrokeCap::Round,
        stroke_join: StrokeJoin::Round,
        stroke_miter_limit: StrokeMiterLimit(4.0),
        stroke_dash_array: None,
        marker_start_shape: StrokeMarkerPreset::None,
        marker_end_shape: StrokeMarkerPreset::None,
        layout_child: None,
    });

    flat_scene("L0 Vector", vec![closed, open, region_fill, varwidth])
}
