use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_effects() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.size = Size {
        width: 2000.0,
        height: 2000.0,
    };
    root_container_node.name = Some("Root Container".to_string());

    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);
    let spacing = 200.0;
    let start_x = 50.0;
    let base_size = 150.0;

    // Row 1: Drop Shadow Variations
    for i in 0..6 {
        if i < 3 {
            // First three shapes as rectangles
            let mut rect = nf.create_rectangle_node();
            rect.name = Some(format!("Drop Shadow Rect {}", i + 1));
            rect.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
            rect.size = Size {
                width: base_size,
                height: base_size,
            };
            rect.corner_radius = RectangularCornerRadius::circular(20.0);
            rect.set_fill(Paint::from(CGColor(255, 255, 255, 255)));
            rect.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
                dx: 4.0,
                dy: 4.0,
                blur: 4.0 * (i + 1) as f32,
                spread: 0.0,
                color: CGColor(0, 0, 0, 128),
            })]);
            graph.append_child(
                Node::Rectangle(rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last two shapes as regular polygons
            let mut polygon = nf.create_regular_polygon_node();
            polygon.name = Some(format!("Drop Shadow Polygon {}", i + 1));
            polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
            polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            polygon.point_count = i + 3;
            polygon.fills = Paints::new([Paint::from(CGColor(255, 255, 255, 255))]);
            polygon.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
                dx: 4.0,
                dy: 4.0,
                blur: 4.0 * (i + 1) as f32,
                spread: 2.0 * (i + 1) as f32,
                color: CGColor(0, 0, 0, 128),
            })]);
            graph.append_child(
                Node::RegularPolygon(polygon),
                Parent::NodeId(root_container_id.clone()),
            );
        }
    }

    // Row 2: Gaussian Blur Variations
    for i in 0..6 {
        if i < 3 {
            // First three shapes as rectangles
            let mut rect = nf.create_rectangle_node();
            rect.name = Some(format!("Gaussian Blur Rect {}", i + 1));
            rect.transform = AffineTransform::new(start_x + spacing * i as f32, 300.0, 0.0);
            rect.size = Size {
                width: base_size,
                height: base_size,
            };
            rect.corner_radius = RectangularCornerRadius::circular(20.0);
            rect.set_fill(Paint::from(CGColor(200, 200, 200, 255)));
            rect.effects =
                LayerEffects::from_array(vec![FilterEffect::LayerBlur(FeGaussianBlur {
                    radius: 4.0 * (i + 1) as f32,
                })]);
            graph.append_child(
                Node::Rectangle(rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last two shapes as regular polygons
            let mut polygon = nf.create_regular_polygon_node();
            polygon.name = Some(format!("Gaussian Blur Polygon {}", i + 1));
            polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 300.0, 0.0);
            polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            polygon.point_count = i + 3;
            polygon.fills = Paints::new([Paint::from(CGColor(200, 200, 200, 255))]);
            polygon.effects =
                LayerEffects::from_array(vec![FilterEffect::LayerBlur(FeGaussianBlur {
                    radius: 4.0 * (i + 1) as f32,
                })]);
            graph.append_child(
                Node::RegularPolygon(polygon),
                Parent::NodeId(root_container_id.clone()),
            );
        }
    }

    // Row 3: Backdrop Blur Variations
    // Add a vivid gradient background behind Row 2 (Backdrop Blur Variations)
    let mut vivid_gradient_rect = nf.create_rectangle_node();
    vivid_gradient_rect.name = Some("Vivid Gradient Row2".to_string());
    vivid_gradient_rect.transform = AffineTransform::new(0.0, 530.0, 0.0); // y middle of row 2
    vivid_gradient_rect.size = Size {
        width: 2000.0,
        height: 90.0,
    };
    vivid_gradient_rect.set_fill(Paint::LinearGradient(LinearGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor(255, 0, 128, 255),
            }, // Pink
            GradientStop {
                offset: 0.5,
                color: CGColor(0, 255, 255, 255),
            }, // Cyan
            GradientStop {
                offset: 1.0,
                color: CGColor(255, 255, 0, 255),
            }, // Yellow
        ],
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        active: true,
    }));
    graph.append_child(
        Node::Rectangle(vivid_gradient_rect),
        Parent::NodeId(root_container_id.clone()),
    );

    for i in 0..6 {
        if i < 3 {
            // First three shapes as rectangles
            let mut blur_rect = nf.create_rectangle_node();
            blur_rect.name = Some(format!("Backdrop Blur Rect {}", i + 1));
            blur_rect.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
            blur_rect.size = Size {
                width: base_size,
                height: base_size,
            };
            blur_rect.corner_radius = RectangularCornerRadius::circular(20.0);
            blur_rect.set_fill(Paint::from(CGColor(255, 255, 255, 128)));
            blur_rect.effects =
                LayerEffects::from_array(vec![FilterEffect::BackdropBlur(FeGaussianBlur {
                    radius: 8.0 * (i + 1) as f32,
                })]);
            graph.append_child(
                Node::Rectangle(blur_rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last two shapes as regular polygons
            let mut blur_polygon = nf.create_regular_polygon_node();
            blur_polygon.name = Some(format!("Backdrop Blur Polygon {}", i + 1));
            blur_polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
            blur_polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            blur_polygon.point_count = i + 3;
            blur_polygon.fills = Paints::new([Paint::from(CGColor(255, 255, 255, 128))]);
            blur_polygon.effects =
                LayerEffects::from_array(vec![FilterEffect::BackdropBlur(FeGaussianBlur {
                    radius: 8.0 * (i + 1) as f32,
                })]);
            graph.append_child(
                Node::RegularPolygon(blur_polygon),
                Parent::NodeId(root_container_id.clone()),
            );
        }
    }

    // Row 4: Inner Shadow Variations
    for i in 0..6 {
        if i < 3 {
            // First three shapes as rectangles
            let mut rect = nf.create_rectangle_node();
            rect.name = Some(format!("Inner Shadow Rect {}", i + 1));
            rect.transform = AffineTransform::new(start_x + spacing * i as f32, 700.0, 0.0);
            rect.size = Size {
                width: base_size,
                height: base_size,
            };
            rect.corner_radius = RectangularCornerRadius::circular(20.0);
            rect.set_fill(Paint::from(CGColor(240, 240, 240, 255)));
            rect.effects = LayerEffects::from_array(vec![FilterEffect::InnerShadow(FeShadow {
                dx: 2.0,
                dy: 2.0,
                blur: 3.0 * (i + 1) as f32,
                spread: 0.0,
                color: CGColor(0, 0, 0, 100),
            })]);
            graph.append_child(
                Node::Rectangle(rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last three shapes as regular polygons
            let mut polygon = nf.create_regular_polygon_node();
            polygon.name = Some(format!("Inner Shadow Polygon {}", i + 1));
            polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 700.0, 0.0);
            polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            polygon.point_count = i + 3;
            polygon.fills = Paints::new([Paint::from(CGColor(240, 240, 240, 255))]);
            polygon.effects = LayerEffects::from_array(vec![FilterEffect::InnerShadow(FeShadow {
                dx: 2.0,
                dy: 2.0,
                blur: 3.0 * (i + 1) as f32,
                spread: 2.0 * (i + 1) as f32,
                color: CGColor(0, 0, 0, 100),
            })]);
            graph.append_child(
                Node::RegularPolygon(polygon),
                Parent::NodeId(root_container_id.clone()),
            );
        }
    }

    // Row 5: Multiple Effects Per Node
    for i in 0..6 {
        if i < 3 {
            // First three shapes as rectangles with multiple effects
            let mut rect = nf.create_rectangle_node();
            rect.name = Some(format!("Multiple Effects Rect {}", i + 1));
            rect.transform = AffineTransform::new(start_x + spacing * i as f32, 950.0, 0.0);
            rect.size = Size {
                width: base_size,
                height: base_size,
            };
            rect.corner_radius = RectangularCornerRadius::circular(20.0);
            rect.set_fill(Paint::from(CGColor(255, 255, 255, 255)));

            // Combine multiple effects based on index
            let effects = match i {
                0 => vec![
                    FilterEffect::DropShadow(FeShadow {
                        dx: 6.0,
                        dy: 6.0,
                        blur: 8.0,
                        spread: 0.0,
                        color: CGColor(0, 0, 0, 100),
                    }),
                    FilterEffect::InnerShadow(FeShadow {
                        dx: -2.0,
                        dy: -2.0,
                        blur: 4.0,
                        spread: 0.0,
                        color: CGColor(0, 0, 0, 80),
                    }),
                ],
                1 => vec![
                    FilterEffect::DropShadow(FeShadow {
                        dx: 4.0,
                        dy: 4.0,
                        blur: 6.0,
                        spread: 0.0,
                        color: CGColor(0, 0, 0, 120),
                    }),
                    FilterEffect::LayerBlur(FeGaussianBlur { radius: 2.0 }),
                ],
                2 => vec![
                    FilterEffect::DropShadow(FeShadow {
                        dx: 8.0,
                        dy: 8.0,
                        blur: 12.0,
                        spread: 2.0,
                        color: CGColor(0, 0, 0, 150),
                    }),
                    FilterEffect::InnerShadow(FeShadow {
                        dx: -1.0,
                        dy: -1.0,
                        blur: 3.0,
                        spread: 0.0,
                        color: CGColor(255, 255, 255, 100),
                    }),
                    FilterEffect::LayerBlur(FeGaussianBlur { radius: 1.0 }),
                ],
                _ => vec![],
            };

            rect.effects = LayerEffects::from_array(effects);
            graph.append_child(
                Node::Rectangle(rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last three shapes as regular polygons with multiple effects
            let mut polygon = nf.create_regular_polygon_node();
            polygon.name = Some(format!("Multiple Effects Polygon {}", i + 1));
            polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 950.0, 0.0);
            polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            polygon.point_count = i + 3;
            polygon.fills = Paints::new([Paint::from(CGColor(255, 255, 255, 255))]);

            // Combine multiple effects based on index
            let effects = match i {
                3 => vec![
                    FilterEffect::DropShadow(FeShadow {
                        dx: 5.0,
                        dy: 5.0,
                        blur: 10.0,
                        spread: 0.0,
                        color: CGColor(0, 0, 0, 110),
                    }),
                    FilterEffect::BackdropBlur(FeGaussianBlur { radius: 4.0 }),
                ],
                4 => vec![
                    FilterEffect::InnerShadow(FeShadow {
                        dx: 3.0,
                        dy: 3.0,
                        blur: 6.0,
                        spread: 0.0,
                        color: CGColor(0, 0, 0, 90),
                    }),
                    FilterEffect::LayerBlur(FeGaussianBlur { radius: 3.0 }),
                ],
                5 => vec![
                    FilterEffect::DropShadow(FeShadow {
                        dx: 10.0,
                        dy: 10.0,
                        blur: 15.0,
                        spread: 3.0,
                        color: CGColor(0, 0, 0, 180),
                    }),
                    FilterEffect::InnerShadow(FeShadow {
                        dx: -2.0,
                        dy: -2.0,
                        blur: 5.0,
                        spread: 0.0,
                        color: CGColor(255, 255, 255, 120),
                    }),
                    FilterEffect::LayerBlur(FeGaussianBlur { radius: 2.0 }),
                ],
                _ => vec![],
            };

            polygon.effects = LayerEffects::from_array(effects);
            graph.append_child(
                Node::RegularPolygon(polygon),
                Parent::NodeId(root_container_id.clone()),
            );
        }
    }

    Scene {
        name: "Effects Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_effects().await;
    window::run_demo_window(scene).await;
}
