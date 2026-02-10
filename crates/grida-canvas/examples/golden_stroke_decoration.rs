//! # Stroke Decoration – Golden Test (full renderer pipeline)
//!
//! Tests the `StrokeDecoration` rendering using the **real Grida renderer**
//! (`Renderer` → layer flattening → painter → marker module).
//!
//! This exercises the same code path as the production editor, ensuring that
//! `LineNodeRec.stroke_decoration_start/end` flows through layer flattening
//! and is drawn by the painter.
//!
//! ## Layout
//!
//! | Row | Decoration variant    | What you see (Straight line)                            |
//! |-----|-----------------------|---------------------------------------------------------|
//! | 1   | ArrowFilled           | Filled triangle arrowheads (start reversed, end normal) |
//! | 2   | ArrowOpen             | Open chevron arrowheads                                 |
//! | 3   | CircleFilled          | Filled circles at endpoints                             |
//! | 4   | DiamondFilled         | Filled diamonds at endpoints                            |
//! | 5   | TriangleFilled        | Filled triangles at endpoints                           |
//! | 6   | Mixed (start≠end)     | ArrowFilled at start, CircleFilled at end               |
//! | 7   | None (control)        | No decoration, just stroke cap                          |
//! | 8   | Wide stroke (sw=6)    | ArrowFilled on a thick stroke                           |

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use cg::vectornetwork::vn::{VectorNetwork, VectorNetworkSegment};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

fn build_scene() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let rows: Vec<(&str, StrokeDecoration, StrokeDecoration, f32)> = vec![
        (
            "ArrowFilled",
            StrokeDecoration::ArrowFilled,
            StrokeDecoration::ArrowFilled,
            2.5,
        ),
        (
            "ArrowOpen",
            StrokeDecoration::ArrowOpen,
            StrokeDecoration::ArrowOpen,
            2.5,
        ),
        (
            "CircleFilled",
            StrokeDecoration::CircleFilled,
            StrokeDecoration::CircleFilled,
            2.5,
        ),
        (
            "DiamondFilled",
            StrokeDecoration::DiamondFilled,
            StrokeDecoration::DiamondFilled,
            2.5,
        ),
        (
            "TriangleFilled",
            StrokeDecoration::TriangleFilled,
            StrokeDecoration::TriangleFilled,
            2.5,
        ),
        (
            "Mixed",
            StrokeDecoration::ArrowFilled,
            StrokeDecoration::CircleFilled,
            2.5,
        ),
        (
            "None (control)",
            StrokeDecoration::None,
            StrokeDecoration::None,
            2.5,
        ),
        (
            "Wide stroke",
            StrokeDecoration::ArrowFilled,
            StrokeDecoration::ArrowFilled,
            6.0,
        ),
    ];

    for (i, (_label, start, end, sw)) in rows.iter().enumerate() {
        let y = 50.0 + i as f32 * 80.0;

        let mut line = nf.create_line_node();
        line.transform = AffineTransform::new(80.0, y, 0.0);
        line.size = Size {
            width: 400.0,
            height: 0.0,
        };
        line.stroke_width = *sw;
        line.strokes = Paints::new([Paint::from(CGColor::from_rgba(60, 60, 60, 255))]);
        line.stroke_cap = StrokeCap::Butt;
        line.stroke_decoration_start = *start;
        line.stroke_decoration_end = *end;

        graph.append_child(Node::Line(line), Parent::Root);
    }

    // -----------------------------------------------------------------------
    // VectorNode rows — Straight, Zigzag, Curve through the Vector pipeline
    // -----------------------------------------------------------------------

    // Helper to build a VectorNodeRec
    let make_vector = |network: VectorNetwork,
                       x: f32,
                       y: f32,
                       start: StrokeDecoration,
                       end: StrokeDecoration,
                       color: CGColor|
     -> VectorNodeRec {
        VectorNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: AffineTransform::new(x, y, 0.0),
            network,
            corner_radius: 0.0,
            fills: Paints::default(),
            strokes: Paints::new([Paint::from(color)]),
            stroke_width: 2.5,
            stroke_width_profile: None,
            stroke_align: StrokeAlign::Center,
            stroke_cap: StrokeCap::Butt,
            stroke_join: StrokeJoin::default(),
            stroke_miter_limit: StrokeMiterLimit::default(),
            stroke_dash_array: None,
            stroke_decoration_start: start,
            stroke_decoration_end: end,
            vertex_overrides: Vec::new(),
            layout_child: None,
        }
    };

    // --- Networks ---
    let straight_net = || VectorNetwork {
        vertices: vec![(0.0, 0.0), (400.0, 0.0)],
        segments: vec![VectorNetworkSegment::ab(0, 1)],
        regions: vec![],
    };

    let zigzag_net = || VectorNetwork {
        vertices: vec![
            (0.0, 20.0),
            (100.0, -20.0),
            (200.0, 20.0),
            (300.0, -20.0),
            (400.0, 10.0),
        ],
        segments: vec![
            VectorNetworkSegment::ab(0, 1),
            VectorNetworkSegment::ab(1, 2),
            VectorNetworkSegment::ab(2, 3),
            VectorNetworkSegment::ab(3, 4),
        ],
        regions: vec![],
    };

    let curve_net = || VectorNetwork {
        vertices: vec![(0.0, 0.0), (400.0, 0.0)],
        segments: vec![VectorNetworkSegment {
            a: 0,
            b: 1,
            ta: (120.0, -80.0),
            tb: (-120.0, -80.0),
        }],
        regions: vec![],
    };

    let blue = CGColor::from_rgba(60, 60, 220, 255);
    let base_y = 50.0 + rows.len() as f32 * 80.0;

    // Row: Vec Straight — ArrowFilled both ends
    let y = base_y;
    graph.append_child(
        Node::Vector(make_vector(
            straight_net(),
            80.0,
            y,
            StrokeDecoration::ArrowFilled,
            StrokeDecoration::ArrowFilled,
            blue,
        )),
        Parent::Root,
    );

    // Row: Vec Zigzag — ArrowFilled + CircleFilled
    let y = base_y + 80.0;
    graph.append_child(
        Node::Vector(make_vector(
            zigzag_net(),
            80.0,
            y,
            StrokeDecoration::ArrowFilled,
            StrokeDecoration::CircleFilled,
            blue,
        )),
        Parent::Root,
    );

    // Row: Vec Curve — DiamondFilled both ends
    let y = base_y + 160.0;
    graph.append_child(
        Node::Vector(make_vector(
            curve_net(),
            80.0,
            y,
            StrokeDecoration::DiamondFilled,
            StrokeDecoration::DiamondFilled,
            blue,
        )),
        Parent::Root,
    );

    // Row: Vec Curve — ArrowFilled + TriangleFilled
    let y = base_y + 240.0;
    graph.append_child(
        Node::Vector(make_vector(
            curve_net(),
            80.0,
            y,
            StrokeDecoration::ArrowFilled,
            StrokeDecoration::TriangleFilled,
            blue,
        )),
        Parent::Root,
    );

    // Row: Vec Zigzag — ArrowOpen both ends
    let y = base_y + 320.0;
    graph.append_child(
        Node::Vector(make_vector(
            zigzag_net(),
            80.0,
            y,
            StrokeDecoration::ArrowOpen,
            StrokeDecoration::ArrowOpen,
            blue,
        )),
        Parent::Root,
    );

    Scene {
        name: "stroke decoration golden".into(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

#[tokio::main]
async fn main() {
    let scene = build_scene();

    let width = 600.0;
    let height = 1120.0;

    let mut renderer = Renderer::new(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, width, height)),
    );
    renderer.load_scene(scene);

    let surface = unsafe { &mut *renderer.backend.get_surface() };
    let canvas = surface.canvas();
    renderer.render_to_canvas(canvas, width, height);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();

    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/goldens/stroke_decoration.png"
    );
    std::fs::write(path, data.as_bytes()).unwrap();
    println!("Saved {}", path);

    renderer.free();
}
