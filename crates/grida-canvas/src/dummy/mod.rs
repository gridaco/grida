use crate::cg::types::*;
use crate::node::{factory::NodeFactory, repository::NodeRepository, schema::*};

/// Load a simple demo scene with a few colored rectangles.
pub(crate) fn create_dummy_scene() -> Scene {
    let nf = NodeFactory::new();
    let mut nodes = NodeRepository::new();

    let mut rect1 = nf.create_rectangle_node();
    rect1.name = Some("Red Rectangle".to_string());
    rect1.transform = math2::transform::AffineTransform::new(100.0, 100.0, 0.0);
    rect1.size = Size {
        width: 150.0,
        height: 100.0,
    };
    rect1.set_fill(Paint::Solid(SolidPaint {
        color: CGColor(255, 0, 0, 255),
        opacity: 1.0,
    }));
    let rect1_id = rect1.id.clone();
    nodes.insert(Node::Rectangle(rect1));

    let mut rect2 = nf.create_rectangle_node();
    rect2.name = Some("Blue Rectangle".to_string());
    rect2.transform = math2::transform::AffineTransform::new(300.0, 100.0, 0.0);
    rect2.size = Size {
        width: 120.0,
        height: 80.0,
    };
    rect2.set_fill(Paint::Solid(SolidPaint {
        color: CGColor(0, 0, 255, 255),
        opacity: 1.0,
    }));
    let rect2_id = rect2.id.clone();
    nodes.insert(Node::Rectangle(rect2));

    let mut rect3 = nf.create_rectangle_node();
    rect3.name = Some("Green Rectangle".to_string());
    rect3.transform = math2::transform::AffineTransform::new(500.0, 100.0, 0.0);
    rect3.size = Size {
        width: 100.0,
        height: 120.0,
    };
    rect3.set_fill(Paint::Solid(SolidPaint {
        color: CGColor(0, 255, 0, 255),
        opacity: 1.0,
    }));
    let rect3_id = rect3.id.clone();
    nodes.insert(Node::Rectangle(rect3));

    Scene {
        id: "dummy".to_string(),
        name: "Dummy Scene".to_string(),
        children: vec![rect1_id, rect2_id, rect3_id],
        nodes,
        background_color: Some(CGColor(240, 240, 240, 255)),
    }
}

/// Load a heavy scene useful for performance benchmarking.
pub(crate) fn create_benchmark_scene(cols: u32, rows: u32) -> Scene {
    let nf = NodeFactory::new();
    let mut nodes = NodeRepository::new();
    let mut children = Vec::new();

    let size = 20.0f32;
    let spacing = 5.0f32;
    for y in 0..rows {
        for x in 0..cols {
            let mut rect = nf.create_rectangle_node();
            rect.name = Some(format!("rect-{}-{}", x, y));
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
                opacity: 1.0,
            }));
            let id = rect.id.clone();
            nodes.insert(Node::Rectangle(rect));
            children.push(id);
        }
    }

    Scene {
        id: "benchmark".to_string(),
        name: "Benchmark Scene".to_string(),
        children,
        nodes,
        background_color: Some(CGColor(255, 255, 255, 255)),
    }
}
