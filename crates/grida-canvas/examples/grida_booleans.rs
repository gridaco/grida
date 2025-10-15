// FIXME: broken demo - make this golden_ not grida_

use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_booleans() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.name = Some("Root Container".to_string());
    root_container_node.size = Size {
        width: 1080.0,
        height: 1080.0,
    };

    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);
    let spacing = 200.0;
    let start_x = 100.0;
    let base_size = 100.0;

    // Example 1: Rectangle and Circle Union
    {
        let y_offset = 150.0; // Increased from 100.0 to give more room at top

        // Create shapes
        let mut rect = nf.create_rectangle_node();
        rect.name = Some("Rectangle".to_string());
        rect.transform = AffineTransform::new(start_x, y_offset, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.set_fill(Paint::from(CGColor(200, 200, 200, 255)));

        let mut circle = nf.create_ellipse_node();
        circle.name = Some("Circle".to_string());
        circle.transform = AffineTransform::new(start_x + spacing, y_offset, 0.0);
        circle.size = Size {
            width: base_size,
            height: base_size,
        };
        circle.fills = Paints::new([Paint::from(CGColor(200, 200, 200, 255))]);

        // Add description text
        let mut text = nf.create_text_span_node();
        text.name = Some("Description".to_string());
        text.transform = AffineTransform::new(start_x, y_offset - 40.0, 0.0); // Moved text up slightly
        text.text = "Union (A ∪ B): Combines two shapes into one".to_string();
        text.text_style.font_size = 16.0;
        text.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);

        // Create boolean operation
        let bool_node = BooleanPathOperationNodeRec {
            name: Some("Union Operation".to_string()),
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: Some(AffineTransform::new(start_x + spacing * 2.0, y_offset, 0.0)),
            op: BooleanPathOperation::Union,
            corner_radius: None,
            fills: Paints::new([Paint::from(CGColor(100, 100, 200, 255))]),
            strokes: Paints::new([Paint::from(CGColor(0, 0, 0, 255))]),
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
        };

        // Add boolean operation to root, then add operands to it
        let bool_id = graph.append_child(
            Node::BooleanOperation(bool_node),
            Parent::NodeId(root_container_id.clone()),
        );
        graph.append_children(
            vec![Node::Rectangle(rect), Node::Ellipse(circle)],
            Parent::NodeId(bool_id),
        );
        graph.append_child(
            Node::TextSpan(text),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Example 2: Two Circles Intersection
    {
        let y_offset = 400.0; // Increased from 300.0

        // Create shapes
        let mut circle1 = nf.create_ellipse_node();
        circle1.name = Some("Circle 1".to_string());
        circle1.transform = AffineTransform::new(start_x, y_offset, 0.0);
        circle1.size = Size {
            width: base_size,
            height: base_size,
        };
        circle1.fills = Paints::new([Paint::from(CGColor(200, 200, 200, 255))]);

        let mut circle2 = nf.create_ellipse_node();
        circle2.name = Some("Circle 2".to_string());
        circle2.transform = AffineTransform::new(start_x + 100.0, y_offset, 0.0);
        circle2.size = Size {
            width: base_size,
            height: base_size,
        };
        circle2.fills = Paints::new([Paint::from(CGColor(200, 200, 200, 255))]);

        // Add description text
        let mut text = nf.create_text_span_node();
        text.name = Some("Description".to_string());
        text.transform = AffineTransform::new(start_x, y_offset - 40.0, 0.0);
        text.text = "Intersection (A ∩ B): Shows only the overlapping area".to_string();
        text.text_style.font_size = 16.0;
        text.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);

        // Create boolean operation
        let bool_node = BooleanPathOperationNodeRec {
            name: Some("Intersection Operation".to_string()),
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: Some(AffineTransform::new(start_x + spacing * 2.0, y_offset, 0.0)),
            op: BooleanPathOperation::Intersection,
            corner_radius: None,
            fills: Paints::new([Paint::from(CGColor(100, 100, 200, 255))]),
            strokes: Paints::new([Paint::from(CGColor(0, 0, 0, 255))]),
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
        };

        // Collect IDs before moving nodes
        // Add boolean operation to root, then add operands to it
        let bool_id = graph.append_child(
            Node::BooleanOperation(bool_node),
            Parent::NodeId(root_container_id.clone()),
        );
        graph.append_children(
            vec![Node::Ellipse(circle1), Node::Ellipse(circle2)],
            Parent::NodeId(bool_id),
        );
        graph.append_child(
            Node::TextSpan(text),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Example 3: Star and Rectangle Difference
    {
        let y_offset = 650.0; // Increased from 500.0

        // Create shapes
        let mut star = nf.create_regular_star_polygon_node();
        star.name = Some("Star".to_string());
        star.transform = AffineTransform::new(start_x, y_offset, 0.0);
        star.size = Size {
            width: base_size,
            height: base_size,
        };
        star.fills = Paints::new([Paint::from(CGColor(200, 200, 200, 255))]);

        let mut rect = nf.create_rectangle_node();
        rect.name = Some("Rectangle".to_string());
        rect.transform = AffineTransform::new(start_x + spacing * 0.5, y_offset, 0.0);
        rect.size = Size {
            width: base_size * 0.8,
            height: base_size * 0.8,
        };
        rect.set_fill(Paint::from(CGColor(200, 200, 200, 255)));

        // Add description text
        let mut text = nf.create_text_span_node();
        text.name = Some("Description".to_string());
        text.transform = AffineTransform::new(start_x, y_offset - 40.0, 0.0);
        text.text = "Difference (A - B): Removes the second shape from the first".to_string();
        text.text_style.font_size = 16.0;
        text.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);

        // Create boolean operation
        let bool_node = BooleanPathOperationNodeRec {
            name: Some("Difference Operation".to_string()),
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: Some(AffineTransform::new(start_x + spacing * 2.0, y_offset, 0.0)),
            op: BooleanPathOperation::Difference,
            corner_radius: None,
            fills: Paints::new([Paint::from(CGColor(100, 100, 200, 255))]),
            strokes: Paints::new([Paint::from(CGColor(0, 0, 0, 255))]),
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
        };

        // Collect IDs before moving nodes
        // Add boolean operation to root, then add operands to it
        let bool_id = graph.append_child(
            Node::BooleanOperation(bool_node),
            Parent::NodeId(root_container_id.clone()),
        );
        graph.append_children(
            vec![Node::RegularStarPolygon(star), Node::Rectangle(rect)],
            Parent::NodeId(bool_id),
        );
        graph.append_child(
            Node::TextSpan(text),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Example 4): Two Squares XOR
    {
        let y_offset = 900.0; // Increased from 700.0

        // Create shapes
        let mut square1 = nf.create_rectangle_node();
        square1.name = Some("Square 1".to_string());
        square1.transform = AffineTransform::new(start_x, y_offset, 0.0);
        square1.size = Size {
            width: base_size,
            height: base_size,
        };
        square1.set_fill(Paint::from(CGColor(200, 200, 200, 255)));

        let mut square2 = nf.create_rectangle_node();
        square2.name = Some("Square 2".to_string());
        square2.transform = AffineTransform::new(start_x + spacing * 0.5, y_offset, 0.0);
        square2.size = Size {
            width: base_size,
            height: base_size,
        };
        square2.set_fill(Paint::from(CGColor(200, 200, 200, 255)));

        // Add description text
        let mut text = nf.create_text_span_node();
        text.name = Some("Description".to_string());
        text.transform = AffineTransform::new(start_x, y_offset - 40.0, 0.0);
        text.text = "XOR (A ⊕ B): Shows areas that don't overlap".to_string();
        text.text_style.font_size = 16.0;
        text.fills = Paints::new([Paint::from(CGColor(0, 0, 0, 255))]);

        // Create boolean operation
        let bool_node = BooleanPathOperationNodeRec {
            name: Some("XOR Operation".to_string()),
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::default(),
            mask: None,
            effects: LayerEffects::default(),
            transform: Some(AffineTransform::new(start_x + spacing * 2.0, y_offset, 0.0)),
            op: BooleanPathOperation::Xor,
            corner_radius: None,
            fills: Paints::new([Paint::from(CGColor(100, 100, 200, 255))]),
            strokes: Paints::new([Paint::from(CGColor(0, 0, 0, 255))]),
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
        };

        // Collect IDs before moving nodes
        // Add boolean operation to root, then add operands to it
        let bool_id = graph.append_child(
            Node::BooleanOperation(bool_node),
            Parent::NodeId(root_container_id.clone()),
        );
        graph.append_children(
            vec![Node::Rectangle(square1), Node::Rectangle(square2)],
            Parent::NodeId(bool_id),
        );
        graph.append_child(
            Node::TextSpan(text),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    Scene {
        name: "Boolean Operations Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_booleans().await;
    window::run_demo_window(scene).await;
}
