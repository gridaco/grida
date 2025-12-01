use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use grida_dev::platform::native_demo;
use math2::transform::AffineTransform;

async fn demo_lines() -> Scene {
    let nf = NodeFactory::new();

    let mut root = nf.create_container_node();
    root.layout_dimensions.width = Some(1000.0);
    root.layout_dimensions.height = Some(600.0);

    let mut graph = SceneGraph::new();

    let start_x = 100.0;
    let start_y = 100.0;
    let spacing = 80.0;
    let length = 300.0;

    // Basic horizontal line
    let mut line_basic = nf.create_line_node();
    line_basic.transform = AffineTransform::new(start_x, start_y, 0.0);
    line_basic.size = Size {
        width: length,
        height: 0.0,
    };
    line_basic.strokes = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);
    line_basic.stroke_width = 2.0;

    // Outside aligned thick line
    let mut line_outside = nf.create_line_node();
    line_outside.transform = AffineTransform::new(start_x, start_y + spacing, 0.0);
    line_outside.size = Size {
        width: length,
        height: 0.0,
    };
    line_outside.strokes = Paints::new([Paint::from(CGColor(255, 0, 0, 255))]);
    line_outside.stroke_width = 8.0;
    line_outside._data_stroke_align = StrokeAlign::Outside;

    // Dashed line
    let mut line_dashed = nf.create_line_node();
    line_dashed.transform = AffineTransform::new(start_x, start_y + spacing * 2.0, 0.0);
    line_dashed.size = Size {
        width: length,
        height: 0.0,
    };
    line_dashed.strokes = Paints::new([Paint::from(CGColor(0, 0, 255, 255))]);
    line_dashed.stroke_width = 4.0;
    line_dashed.stroke_dash_array = Some([10.0, 5.0].into());

    // Gradient stroke line
    let mut line_gradient = nf.create_line_node();
    line_gradient.transform = AffineTransform::new(start_x, start_y + spacing * 3.0, 0.0);
    line_gradient.size = Size {
        width: length,
        height: 0.0,
    };
    line_gradient.strokes = Paints::new([Paint::LinearGradient(LinearGradientPaint::from_colors(
        vec![CGColor(0, 255, 0, 255), CGColor(255, 0, 255, 255)],
    ))]);
    line_gradient.stroke_width = 6.0;

    // Rotated diagonal line
    let mut line_rotated = nf.create_line_node();
    line_rotated.transform =
        AffineTransform::new(start_x, start_y + spacing * 4.0, 45f32.to_radians());
    line_rotated.size = Size {
        width: length,
        height: 0.0,
    };
    line_rotated.strokes = Paints::new([Paint::from(CGColor(0, 128, 128, 255))]);
    line_rotated.stroke_width = 4.0;

    // Set up root container and add all lines
    let root_id = graph.append_child(Node::Container(root), Parent::Root);
    graph.append_children(
        vec![
            Node::Line(line_basic),
            Node::Line(line_outside),
            Node::Line(line_dashed),
            Node::Line(line_gradient),
            Node::Line(line_rotated),
        ],
        Parent::NodeId(root_id),
    );

    Scene {
        name: "LineNode Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_lines().await;
    native_demo::run_demo_window(scene).await;
}
