use cg::node::factory::NodeFactory;
use cg::node::schema::*;
use cg::node::repository::NodeRepository;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_effects() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.size = Size {
        width: 2000.0,
        height: 2000.0,
    };
    root_container_node.base.name = "Root Container".to_string();

    let mut all_effect_ids = Vec::new();
    let spacing = 200.0;
    let start_x = 50.0;
    let base_size = 150.0;

    // Row 1: Drop Shadow Variations
    for i in 0..6 {
        if i < 3 {
            // First three shapes as rectangles
            let mut rect = nf.create_rectangle_node();
            rect.base.name = format!("Drop Shadow Rect {}", i + 1);
            rect.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
            rect.size = Size {
                width: base_size,
                height: base_size,
            };
            rect.corner_radius = RectangularCornerRadius::all(20.0);
            rect.fill = Paint::Solid(SolidPaint {
                color: Color(255, 255, 255, 255), // White
                opacity: 1.0,
            });
            rect.effect = Some(FilterEffect::DropShadow(FeDropShadow {
                dx: 4.0,
                dy: 4.0,
                blur: 4.0 * (i + 1) as f32,
                color: Color(0, 0, 0, 128),
            }));
            all_effect_ids.push(rect.base.id.clone());
            repository.insert(Node::Rectangle(rect));
        } else {
            // Last two shapes as regular polygons
            let mut polygon = nf.create_regular_polygon_node();
            polygon.base.name = format!("Drop Shadow Polygon {}", i + 1);
            polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
            polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            polygon.point_count = i + 3;
            polygon.fill = Paint::Solid(SolidPaint {
                color: Color(255, 255, 255, 255), // White
                opacity: 1.0,
            });
            polygon.effect = Some(FilterEffect::DropShadow(FeDropShadow {
                dx: 4.0,
                dy: 4.0,
                blur: 4.0 * (i + 1) as f32,
                color: Color(0, 0, 0, 128),
            }));
            all_effect_ids.push(polygon.base.id.clone());
            repository.insert(Node::RegularPolygon(polygon));
        }
    }

    // Row 2: Gaussian Blur Variations
    for i in 0..6 {
        if i < 3 {
            // First three shapes as rectangles
            let mut rect = nf.create_rectangle_node();
            rect.base.name = format!("Gaussian Blur Rect {}", i + 1);
            rect.transform = AffineTransform::new(start_x + spacing * i as f32, 300.0, 0.0);
            rect.size = Size {
                width: base_size,
                height: base_size,
            };
            rect.corner_radius = RectangularCornerRadius::all(20.0);
            rect.fill = Paint::Solid(SolidPaint {
                color: Color(200, 200, 200, 255), // White
                opacity: 1.0,
            });
            rect.effect = Some(FilterEffect::GaussianBlur(FeGaussianBlur {
                radius: 4.0 * (i + 1) as f32,
            }));
            all_effect_ids.push(rect.base.id.clone());
            repository.insert(Node::Rectangle(rect));
        } else {
            // Last two shapes as regular polygons
            let mut polygon = nf.create_regular_polygon_node();
            polygon.base.name = format!("Gaussian Blur Polygon {}", i + 1);
            polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 300.0, 0.0);
            polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            polygon.point_count = i + 3;
            polygon.fill = Paint::Solid(SolidPaint {
                color: Color(200, 200, 200, 255), // White
                opacity: 1.0,
            });
            polygon.effect = Some(FilterEffect::GaussianBlur(FeGaussianBlur {
                radius: 4.0 * (i + 1) as f32,
            }));
            all_effect_ids.push(polygon.base.id.clone());
            repository.insert(Node::RegularPolygon(polygon));
        }
    }

    // Row 3: Backdrop Blur Variations
    // Add a vivid gradient background behind Row 2 (Backdrop Blur Variations)
    let mut vivid_gradient_rect = nf.create_rectangle_node();
    vivid_gradient_rect.base.name = "Vivid Gradient Row2".to_string();
    vivid_gradient_rect.transform = AffineTransform::new(0.0, 530.0, 0.0); // y middle of row 2
    vivid_gradient_rect.size = Size {
        width: 2000.0,
        height: 90.0,
    };
    vivid_gradient_rect.fill = Paint::LinearGradient(LinearGradientPaint {
        transform: AffineTransform::identity(),
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: Color(255, 0, 128, 255),
            }, // Pink
            GradientStop {
                offset: 0.5,
                color: Color(0, 255, 255, 255),
            }, // Cyan
            GradientStop {
                offset: 1.0,
                color: Color(255, 255, 0, 255),
            }, // Yellow
        ],
        opacity: 1.0,
    });
    let vivid_gradient_rect_id = vivid_gradient_rect.base.id.clone();
    repository.insert(Node::Rectangle(vivid_gradient_rect));

    for i in 0..6 {
        if i < 3 {
            // First three shapes as rectangles
            let mut blur_rect = nf.create_rectangle_node();
            blur_rect.base.name = format!("Backdrop Blur Rect {}", i + 1);
            blur_rect.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
            blur_rect.size = Size {
                width: base_size,
                height: base_size,
            };
            blur_rect.corner_radius = RectangularCornerRadius::all(20.0);
            blur_rect.fill = Paint::Solid(SolidPaint {
                color: Color(255, 255, 255, 128), // Semi-transparent white
                opacity: 1.0,
            });
            blur_rect.effect = Some(FilterEffect::BackdropBlur(FeBackdropBlur {
                radius: 8.0 * (i + 1) as f32,
            }));
            all_effect_ids.push(blur_rect.base.id.clone());
            repository.insert(Node::Rectangle(blur_rect));
        } else {
            // Last two shapes as regular polygons
            let mut blur_polygon = nf.create_regular_polygon_node();
            blur_polygon.base.name = format!("Backdrop Blur Polygon {}", i + 1);
            blur_polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
            blur_polygon.size = Size {
                width: base_size,
                height: base_size,
            };
            blur_polygon.point_count = i + 3;
            blur_polygon.fill = Paint::Solid(SolidPaint {
                color: Color(255, 255, 255, 128), // Semi-transparent white
                opacity: 1.0,
            });
            blur_polygon.effect = Some(FilterEffect::BackdropBlur(FeBackdropBlur {
                radius: 8.0 * (i + 1) as f32,
            }));
            all_effect_ids.push(blur_polygon.base.id.clone());
            repository.insert(Node::RegularPolygon(blur_polygon));
        }
    }

    // Set up the root container
    root_container_node.children = vec![vivid_gradient_rect_id];
    root_container_node.children.extend(all_effect_ids);
    let root_container_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Effects Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(Color(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_effects().await;
    window::run_demo_window(scene).await;
}
