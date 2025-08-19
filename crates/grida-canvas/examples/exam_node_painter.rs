use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::painter::Painter;
use cg::window;
use math2::transform::AffineTransform;
use skia_safe::surfaces;
use std::cell::RefCell;
use std::rc::Rc;

async fn demo_node_painter() -> Scene {
    let nf = NodeFactory::new();

    // Create a simple rectangle node
    let mut rect_node = nf.create_rectangle_node();
    rect_node.name = Some("Test Rectangle".to_string());
    rect_node.transform = AffineTransform::new(100.0, 100.0, 0.0);
    rect_node.size = Size {
        width: 200.0,
        height: 100.0,
    };
    rect_node.set_fill(Paint::Solid(SolidPaint {
        color: CGColor(255, 0, 0, 255), // Red fill
        opacity: 1.0,
    }));
    rect_node.stroke_width = 2.0;
    rect_node.strokes = vec![Paint::Solid(SolidPaint {
        color: CGColor(0, 0, 0, 255), // Black stroke
        opacity: 1.0,
    })];

    // Create a simple ellipse node
    let mut ellipse_node = nf.create_ellipse_node();
    ellipse_node.name = Some("Test Ellipse".to_string());
    ellipse_node.transform = AffineTransform::new(400.0, 100.0, 0.0);
    ellipse_node.size = Size {
        width: 150.0,
        height: 150.0,
    };
    ellipse_node.set_fill(Paint::Solid(SolidPaint {
        color: CGColor(0, 255, 0, 255), // Green fill
        opacity: 1.0,
    }));

    // Create a text node
    let mut text_node = nf.create_text_span_node();
    text_node.name = Some("Test Text".to_string());
    text_node.transform = AffineTransform::new(100.0, 300.0, 0.0);
    text_node.size = Size {
        width: 300.0,
        height: 50.0,
    };
    text_node.text = "Hello, NodePainter!".to_string();
    text_node.fill = Paint::Solid(SolidPaint {
        color: CGColor(0, 0, 255, 255), // Blue text
        opacity: 1.0,
    });
    text_node.text_style.font_size = 24.0;

    // Create a node repository
    let mut repository = NodeRepository::new();

    // Collect IDs first
    let rect_id = rect_node.id.clone();
    let ellipse_id = ellipse_node.id.clone();
    let text_id = text_node.id.clone();

    // Add nodes to repository
    repository.insert(Node::Rectangle(rect_node));
    repository.insert(Node::Ellipse(ellipse_node));
    repository.insert(Node::TextSpan(text_node));

    // Create a root container
    let mut root_container = nf.create_container_node();
    root_container.size = Size {
        width: 800.0,
        height: 600.0,
    };
    root_container.name = Some("Root Container".to_string());
    root_container.children = vec![rect_id, ellipse_id, text_id];
    let root_id = root_container.id.clone();
    repository.insert(Node::Container(root_container));

    Scene {
        id: "scene".to_string(),
        name: "NodePainter Demo".to_string(),
        children: vec![root_id],
        nodes: repository,
        background_color: Some(CGColor(250, 250, 250, 255)),
    }
}

// Example function showing how to use NodePainter
fn demonstrate_node_painter_usage() {
    // Create a surface and canvas
    let mut surface = surfaces::raster_n32_premul((800, 600)).unwrap();
    let canvas = surface.canvas();

    // Create repositories
    let fonts = Rc::new(RefCell::new(cg::runtime::repository::FontRepository::new()));
    let images = Rc::new(RefCell::new(cg::runtime::repository::ImageRepository::new()));

    // Create the main Painter
    let painter = Painter::new(canvas, fonts, images);

    // Create a NodePainter that uses the main Painter
    let node_painter = painter.node_painter();

    // Create a simple rectangle node
    let nf = NodeFactory::new();
    let mut rect_node = nf.create_rectangle_node();
    rect_node.transform = AffineTransform::new(50.0, 50.0, 0.0);
    rect_node.size = Size {
        width: 100.0,
        height: 100.0,
    };
    rect_node.set_fill(Paint::Solid(SolidPaint {
        color: CGColor(255, 0, 0, 255),
        opacity: 1.0,
    }));

    // Use NodePainter to draw the node
    node_painter.draw_node(&LeafNode::Rectangle(rect_node));

    println!("NodePainter demonstration completed!");
}

#[tokio::main]
async fn main() {
    // Demonstrate the NodePainter usage
    demonstrate_node_painter_usage();

    // Run the demo scene
    let scene = demo_node_painter().await;
    window::run_demo_window(scene).await;
}
