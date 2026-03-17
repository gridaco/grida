use super::*;
use cg::vectornetwork::*;

/// Variable-width stroke profiles on vector paths: taper, bulge, multi-stop, asymmetric.
pub fn build() -> Scene {
    // Shared S-curve path (4 vertices, 3 segments)
    fn s_curve(x: f32, y: f32, profile: cg::cg::varwidth::VarWidthProfile) -> Node {
        Node::Vector(VectorNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::from_box_center(x, y, 200.0, 100.0, 0.0),
            network: VectorNetwork {
                vertices: vec![(0.0, 100.0), (66.0, 0.0), (133.0, 100.0), (200.0, 0.0)],
                segments: vec![
                    VectorNetworkSegment { a: 0, b: 1, ta: (22.0, -40.0), tb: (-22.0, 20.0) },
                    VectorNetworkSegment { a: 1, b: 2, ta: (22.0, 20.0), tb: (-22.0, -40.0) },
                    VectorNetworkSegment { a: 2, b: 3, ta: (22.0, -40.0), tb: (-22.0, 20.0) },
                ],
                regions: vec![],
            },
            corner_radius: 0.0,
            fills: Paints::new(vec![]),
            strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
            stroke_width: 6.0,
            stroke_width_profile: Some(profile),
            stroke_align: StrokeAlign::Center,
            stroke_cap: StrokeCap::Round,
            stroke_join: StrokeJoin::Round,
            stroke_miter_limit: StrokeMiterLimit(4.0),
            stroke_dash_array: None,
            marker_start_shape: StrokeMarkerPreset::None,
            marker_end_shape: StrokeMarkerPreset::None,
            layout_child: None,
        })
    }

    let gap_y = 130.0;

    // Taper: thick start → thin end
    let taper = s_curve(0.0, 0.0, cg::cg::varwidth::VarWidthProfile {
        base: 3.0,
        stops: vec![
            cg::cg::varwidth::WidthStop { u: 0.0, r: 6.0 },
            cg::cg::varwidth::WidthStop { u: 1.0, r: 0.5 },
        ],
    });

    // Reverse taper: thin start → thick end
    let reverse_taper = s_curve(0.0, gap_y, cg::cg::varwidth::VarWidthProfile {
        base: 3.0,
        stops: vec![
            cg::cg::varwidth::WidthStop { u: 0.0, r: 0.5 },
            cg::cg::varwidth::WidthStop { u: 1.0, r: 6.0 },
        ],
    });

    // Bulge: thin → thick → thin (calligraphy / brush-pen feel)
    let bulge = s_curve(0.0, gap_y * 2.0, cg::cg::varwidth::VarWidthProfile {
        base: 3.0,
        stops: vec![
            cg::cg::varwidth::WidthStop { u: 0.0, r: 1.0 },
            cg::cg::varwidth::WidthStop { u: 0.5, r: 8.0 },
            cg::cg::varwidth::WidthStop { u: 1.0, r: 1.0 },
        ],
    });

    // Multi-stop: irregular width profile (4 stops)
    let multi_stop = s_curve(0.0, gap_y * 3.0, cg::cg::varwidth::VarWidthProfile {
        base: 3.0,
        stops: vec![
            cg::cg::varwidth::WidthStop { u: 0.0, r: 2.0 },
            cg::cg::varwidth::WidthStop { u: 0.25, r: 7.0 },
            cg::cg::varwidth::WidthStop { u: 0.6, r: 1.0 },
            cg::cg::varwidth::WidthStop { u: 1.0, r: 5.0 },
        ],
    });

    // Uniform profile: single stop (should render like a regular constant-width stroke)
    let uniform = s_curve(0.0, gap_y * 4.0, cg::cg::varwidth::VarWidthProfile {
        base: 3.0,
        stops: vec![
            cg::cg::varwidth::WidthStop { u: 0.0, r: 3.0 },
            cg::cg::varwidth::WidthStop { u: 1.0, r: 3.0 },
        ],
    });

    flat_scene(
        "L0 Strokes VarWidth",
        vec![taper, reverse_taper, bulge, multi_stop, uniform],
    )
}
