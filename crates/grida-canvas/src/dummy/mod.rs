use crate::cg::prelude::*;
use crate::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};

/// Load a simple demo scene with a few colored rectangles.
pub(crate) fn create_dummy_scene() -> Scene {
    let nf = NodeFactory::new();

    let mut rect1 = nf.create_rectangle_node();
    rect1.transform = math2::transform::AffineTransform::new(100.0, 100.0, 0.0);
    rect1.size = Size {
        width: 150.0,
        height: 100.0,
    };
    rect1.set_fill(Paint::Solid(SolidPaint::RED));

    let mut rect2 = nf.create_rectangle_node();
    rect2.transform = math2::transform::AffineTransform::new(300.0, 100.0, 0.0);
    rect2.size = Size {
        width: 120.0,
        height: 80.0,
    };
    rect2.set_fill(Paint::Solid(SolidPaint::BLUE));

    let mut rect3 = nf.create_rectangle_node();
    rect3.transform = math2::transform::AffineTransform::new(500.0, 100.0, 0.0);
    rect3.size = Size {
        width: 100.0,
        height: 120.0,
    };
    rect3.set_fill(Paint::Solid(SolidPaint::GREEN));

    let mut graph = SceneGraph::new();
    graph.append_children(
        vec![
            Node::Rectangle(rect1),
            Node::Rectangle(rect2),
            Node::Rectangle(rect3),
        ],
        Parent::Root,
    );

    Scene {
        name: "Dummy Scene".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

/// Load a heavy scene useful for performance benchmarking.
pub(crate) fn create_benchmark_scene(cols: u32, rows: u32) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let size = 20.0f32;
    let spacing = 5.0f32;
    for y in 0..rows {
        for x in 0..cols {
            let mut rect = nf.create_rectangle_node();
            rect.transform = math2::transform::AffineTransform::new(
                x as f32 * (size + spacing),
                y as f32 * (size + spacing),
                0.0,
            );
            rect.size = Size {
                width: size,
                height: size,
            };
            rect.set_fill(Paint::Solid(SolidPaint {
                color: CGColor(((x * 5) % 255) as u8, ((y * 3) % 255) as u8, 128, 255),
                blend_mode: BlendMode::default(),
                active: true,
            }));
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }

    Scene {
        name: "Benchmark Scene".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}
