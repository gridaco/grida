use cg::cg::prelude::*;
use cg::cg::StrokeDecoration;
use cg::node::schema::{LayerEffects, VectorNodeRec};
use cg::vectornetwork::{
    VectorNetwork, VectorNetworkLoop, VectorNetworkRegion, VectorNetworkSegment,
};
use math2::transform::AffineTransform;
use skia_safe::path::Verb;

fn make_square_network() -> VectorNetwork {
    VectorNetwork {
        vertices: vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
        segments: vec![
            VectorNetworkSegment::ab(0, 1),
            VectorNetworkSegment::ab(1, 2),
            VectorNetworkSegment::ab(2, 3),
            VectorNetworkSegment::ab(3, 0),
        ],
        regions: vec![],
    }
}

fn make_square_network_with_region() -> VectorNetwork {
    VectorNetwork {
        vertices: vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
        segments: vec![
            VectorNetworkSegment::ab(0, 1),
            VectorNetworkSegment::ab(1, 2),
            VectorNetworkSegment::ab(2, 3),
            VectorNetworkSegment::ab(3, 0),
        ],
        regions: vec![VectorNetworkRegion {
            loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
            fill_rule: FillRule::NonZero,
            fills: None,
        }],
    }
}

fn collect_verbs(path: &skia_safe::Path) -> Vec<Verb> {
    let mut iter = skia_safe::path::Iter::new(path, false);
    let mut verbs = Vec::new();
    while let Some((verb, _)) = iter.next() {
        verbs.push(verb);
    }
    verbs
}

fn make_node(corner_radius: f32) -> VectorNodeRec {
    VectorNodeRec {
        active: true,
        layout_child: None,
        opacity: 1.0,
        blend_mode: LayerBlendMode::default(),
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::identity(),
        network: make_square_network(),
        corner_radius,
        fills: Paints::default(),
        strokes: Paints::default(),
        stroke_width: 0.0,
        stroke_width_profile: None,
        stroke_align: StrokeAlign::Inside,
        stroke_cap: StrokeCap::default(),
        stroke_join: StrokeJoin::default(),
        stroke_miter_limit: StrokeMiterLimit::default(),
        stroke_dash_array: None,
        stroke_decoration_start: StrokeDecoration::default(),
        stroke_decoration_end: StrokeDecoration::default(),
        vertex_overrides: vec![],
    }
}

fn make_node_with_region(corner_radius: f32) -> VectorNodeRec {
    VectorNodeRec {
        network: make_square_network_with_region(),
        ..make_node(corner_radius)
    }
}

#[test]
fn vector_node_corner_radius_changes_path_geometry() {
    let sharp = make_node(0.0).to_path();
    let rounded = make_node(10.0).to_path();

    let sharp_verbs = collect_verbs(&sharp);
    let rounded_verbs = collect_verbs(&rounded);

    let rounded_has_curves = rounded_verbs
        .iter()
        .any(|v| matches!(v, Verb::Quad | Verb::Conic | Verb::Cubic));
    assert!(
        rounded_has_curves,
        "rounded path should contain curve segments"
    );

    assert_ne!(
        sharp_verbs, rounded_verbs,
        "corner radius should change the path verb sequence"
    );
}

#[test]
fn vector_node_corner_radius_changes_path_geometry_for_regions() {
    let sharp = make_node_with_region(0.0).to_path();
    let rounded = make_node_with_region(10.0).to_path();

    let sharp_verbs = collect_verbs(&sharp);
    let rounded_verbs = collect_verbs(&rounded);

    let rounded_has_curves = rounded_verbs
        .iter()
        .any(|v| matches!(v, Verb::Quad | Verb::Conic | Verb::Cubic));
    assert!(
        rounded_has_curves,
        "rounded path with region should contain curve segments"
    );

    assert_ne!(
        sharp_verbs, rounded_verbs,
        "corner radius with region should change the path verb sequence"
    );
}
