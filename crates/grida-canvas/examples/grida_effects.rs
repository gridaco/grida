use cg::cg::prelude::*;
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
    root_container_node.layout_dimensions.width = Some(2000.0);
    root_container_node.layout_dimensions.height = Some(2000.0);

    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);
    let spacing = 200.0;
    let start_x = 50.0;
    let base_size = 150.0;

    // Row 1: Drop Shadow Variations
    for i in 0..6 {
        if i < 3 {
            // First three shapes as rectangles
            let mut rect = nf.create_rectangle_node();
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
                active: true,
            })]);
            graph.append_child(
                Node::Rectangle(rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last two shapes as regular polygons
            let mut polygon = nf.create_regular_polygon_node();
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
                active: true,
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
            rect.transform = AffineTransform::new(start_x + spacing * i as f32, 300.0, 0.0);
            rect.size = Size {
                width: base_size,
                height: base_size,
            };
            rect.corner_radius = RectangularCornerRadius::circular(20.0);
            rect.set_fill(Paint::from(CGColor(200, 200, 200, 255)));
            let radius = 4.0 * (i + 1) as f32;
            rect.effects = LayerEffects::new().blur(radius);
            graph.append_child(
                Node::Rectangle(rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last two shapes as regular polygons
            let mut polygon = nf.create_regular_polygon_node();
            polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 300.0, 0.0);
            polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            polygon.point_count = i + 3;
            polygon.fills = Paints::new([Paint::from(CGColor(200, 200, 200, 255))]);
            let radius = 4.0 * (i + 1) as f32;
            polygon.effects = LayerEffects::new().blur(radius);
            graph.append_child(
                Node::RegularPolygon(polygon),
                Parent::NodeId(root_container_id.clone()),
            );
        }
    }

    // Row 3: Backdrop Blur Variations
    // Add a vivid gradient background behind Row 2 (Backdrop Blur Variations)
    let mut vivid_gradient_rect = nf.create_rectangle_node();
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
            blur_rect.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
            blur_rect.size = Size {
                width: base_size,
                height: base_size,
            };
            blur_rect.corner_radius = RectangularCornerRadius::circular(20.0);
            blur_rect.set_fill(Paint::from(CGColor(255, 255, 255, 128)));
            let radius = 8.0 * (i + 1) as f32;
            blur_rect.effects = LayerEffects::new().backdrop_blur(radius);
            graph.append_child(
                Node::Rectangle(blur_rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last two shapes as regular polygons
            let mut blur_polygon = nf.create_regular_polygon_node();
            blur_polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
            blur_polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            blur_polygon.point_count = i + 3;
            blur_polygon.fills = Paints::new([Paint::from(CGColor(255, 255, 255, 128))]);
            let radius = 8.0 * (i + 1) as f32;
            blur_polygon.effects = LayerEffects::new().backdrop_blur(radius);
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
                active: true,
            })]);
            graph.append_child(
                Node::Rectangle(rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last three shapes as regular polygons
            let mut polygon = nf.create_regular_polygon_node();
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
                active: true,
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
            rect.transform = AffineTransform::new(start_x + spacing * i as f32, 950.0, 0.0);
            rect.size = Size {
                width: base_size,
                height: base_size,
            };
            rect.corner_radius = RectangularCornerRadius::circular(20.0);
            rect.set_fill(Paint::from(CGColor(255, 255, 255, 255)));

            // Apply multiple effects based on index
            match i {
                0 => {
                    rect.effects = LayerEffects::new()
                        .drop_shadow(FeShadow {
                            dx: 6.0,
                            dy: 6.0,
                            blur: 8.0,
                            spread: 0.0,
                            color: CGColor(0, 0, 0, 100),
                            active: true,
                        })
                        .inner_shadow(FeShadow {
                            dx: -2.0,
                            dy: -2.0,
                            blur: 4.0,
                            spread: 0.0,
                            color: CGColor(0, 0, 0, 80),
                            active: true,
                        });
                }
                1 => {
                    rect.effects = LayerEffects::new()
                        .drop_shadow(FeShadow {
                            dx: 4.0,
                            dy: 4.0,
                            blur: 6.0,
                            spread: 0.0,
                            color: CGColor(0, 0, 0, 120),
                            active: true,
                        })
                        .blur(2.0f32);
                }
                2 => {
                    rect.effects = LayerEffects::new()
                        .drop_shadow(FeShadow {
                            dx: 8.0,
                            dy: 8.0,
                            blur: 12.0,
                            spread: 2.0,
                            color: CGColor(0, 0, 0, 150),
                            active: true,
                        })
                        .inner_shadow(FeShadow {
                            dx: -1.0,
                            dy: -1.0,
                            blur: 3.0,
                            spread: 0.0,
                            color: CGColor(255, 255, 255, 100),
                            active: true,
                        })
                        .blur(1.0f32);
                }
                _ => {}
            }
            graph.append_child(
                Node::Rectangle(rect),
                Parent::NodeId(root_container_id.clone()),
            );
        } else {
            // Last three shapes as regular polygons with multiple effects
            let mut polygon = nf.create_regular_polygon_node();
            polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 950.0, 0.0);
            polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            polygon.point_count = i + 3;
            polygon.fills = Paints::new([Paint::from(CGColor(255, 255, 255, 255))]);

            // Apply multiple effects based on index
            match i {
                3 => {
                    polygon.effects = LayerEffects::new()
                        .drop_shadow(FeShadow {
                            dx: 5.0,
                            dy: 5.0,
                            blur: 10.0,
                            spread: 0.0,
                            color: CGColor(0, 0, 0, 110),
                            active: true,
                        })
                        .backdrop_blur(4.0f32);
                }
                4 => {
                    polygon.effects = LayerEffects::new()
                        .inner_shadow(FeShadow {
                            dx: 3.0,
                            dy: 3.0,
                            blur: 6.0,
                            spread: 0.0,
                            color: CGColor(0, 0, 0, 90),
                            active: true,
                        })
                        .blur(3.0f32);
                }
                5 => {
                    polygon.effects = LayerEffects::new()
                        .drop_shadow(FeShadow {
                            dx: 10.0,
                            dy: 10.0,
                            blur: 15.0,
                            spread: 3.0,
                            color: CGColor(0, 0, 0, 180),
                            active: true,
                        })
                        .inner_shadow(FeShadow {
                            dx: -2.0,
                            dy: -2.0,
                            blur: 5.0,
                            spread: 0.0,
                            color: CGColor(255, 255, 255, 120),
                            active: true,
                        })
                        .blur(2.0f32);
                }
                _ => {}
            }
            graph.append_child(
                Node::RegularPolygon(polygon),
                Parent::NodeId(root_container_id.clone()),
            );
        }
    }

    // Progressive Blur Examples
    let progressive_start_x = 50.0;
    let progressive_y = 1200.0;

    // Row: Progressive Layer Blur
    for i in 0..3 {
        let mut rect = nf.create_rectangle_node();
        rect.transform =
            AffineTransform::new(progressive_start_x + spacing * i as f32, progressive_y, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size * 2.0, // Make it taller to show the gradient
        };
        rect.corner_radius = RectangularCornerRadius::circular(20.0);
        rect.set_fill(Paint::from(CGColor(100, 150, 255, 255)));

        // Create progressive blur effect with node-local coordinates
        let progressive_blur = FeProgressiveBlur {
            start: Alignment(0.0, -1.0), // Top edge center (node-local)
            end: Alignment(0.0, 1.0),    // Bottom edge center (node-local)
            radius: 0.0,
            radius2: 20.0 + (i as f32 * 10.0), // Varying max blur
        };

        rect.effects = LayerEffects::new().blur(progressive_blur);
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Row: Progressive Backdrop Blur
    for i in 0..3 {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(
            progressive_start_x + spacing * (i + 3) as f32,
            progressive_y,
            0.0,
        );
        rect.size = Size {
            width: base_size,
            height: base_size * 2.0,
        };
        rect.corner_radius = RectangularCornerRadius::circular(20.0);
        rect.set_fill(Paint::from(CGColor(255, 255, 255, 100))); // Semi-transparent

        // Create progressive backdrop blur effect with node-local coordinates
        let progressive_blur = FeProgressiveBlur {
            start: Alignment(0.0, -1.0), // Top edge center (node-local)
            end: Alignment(0.0, 1.0),    // Bottom edge center (node-local)
            radius: 0.0,
            radius2: 30.0 + (i as f32 * 15.0), // Varying max blur
        };

        rect.effects = LayerEffects::new().backdrop_blur(progressive_blur);
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
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
