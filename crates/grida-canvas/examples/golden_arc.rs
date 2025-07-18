use cg::cg::types::*;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;
use std::f32::consts::PI;

async fn demo_arcs() -> Scene {
    let mut repository = NodeRepository::new();

    // Create a root container node
    let mut root_container_node = ContainerNode {
        base: BaseNode {
            id: "root".to_string(),
            name: "Arc Demo Root".to_string(),
            active: true,
        },
        transform: AffineTransform::identity(),
        size: Size {
            width: 1200.0,
            height: 800.0,
        },
        corner_radius: RectangularCornerRadius::zero(),
        children: Vec::new(),
        fills: vec![Paint::Solid(SolidPaint {
            color: Color(240, 240, 240, 255), // Light gray background
            opacity: 1.0,
        })],
        strokes: vec![],
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Inside,
        stroke_dash_array: None,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        effects: LayerEffects::new_empty(),
        clip: false,
    };

    let mut all_arc_ids = Vec::new();
    let spacing = 200.0;
    let start_x = 100.0;
    let start_y = 100.0;
    let arc_size = 120.0;

    // Row 1: Different inner radius values (0.0 to 0.8)
    for i in 0..5 {
        let inner_radius = i as f32 * 0.2; // 0.0, 0.2, 0.4, 0.6, 0.8
        
        let arc = ArcNode {
            base: BaseNode {
                id: format!("arc_radius_{}", i),
                name: format!("Arc Inner Radius {:.1}", inner_radius),
                active: true,
            },
            transform: AffineTransform::new(start_x + spacing * i as f32, start_y, 0.0),
            size: Size {
                width: arc_size,
                height: arc_size,
            },
            radius_a: inner_radius,
            angle_a: 0.0, // Start at 0° (positive x-axis)
            angle_b: PI, // End at 180° (half circle)
            fills: vec![Paint::Solid(SolidPaint {
                color: Color(
                    (255.0 * (1.0 - inner_radius)) as u8,
                    (100.0 + (155.0 * inner_radius)) as u8,
                    100,
                    255,
                ),
                opacity: 1.0,
            })],
            strokes: vec![Paint::Solid(SolidPaint {
                color: Color(50, 50, 50, 255),
                opacity: 1.0,
            })],
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        };
        
        all_arc_ids.push(arc.base.id.clone());
        repository.insert(Node::Arc(arc));
    }

    // Row 2: Different angle ranges (quarter, half, three-quarter, full circle)
    let angle_configs = [
        (0.0, PI / 2.0, "Quarter Arc"),      // 0° to 90°
        (0.0, PI, "Half Arc"),               // 0° to 180°
        (0.0, 3.0 * PI / 2.0, "Three Quarter Arc"), // 0° to 270°
        (0.0, 2.0 * PI, "Full Circle"),     // 0° to 360°
        (PI / 4.0, 7.0 * PI / 4.0, "Pac-Man"), // 45° to 315° (Pac-Man shape)
    ];

    for (i, (start_angle, end_angle, name)) in angle_configs.iter().enumerate() {
        let arc = ArcNode {
            base: BaseNode {
                id: format!("arc_angle_{}", i),
                name: name.to_string(),
                active: true,
            },
            transform: AffineTransform::new(start_x + spacing * i as f32, start_y + 200.0, 0.0),
            size: Size {
                width: arc_size,
                height: arc_size,
            },
            radius_a: 0.3, // Consistent inner radius
            angle_a: *start_angle,
            angle_b: *end_angle,
            fills: vec![Paint::Solid(SolidPaint {
                color: Color(
                    100,
                    (100 + i * 30) as u8,
                    (200 - i * 25) as u8,
                    255,
                ),
                opacity: 1.0,
            })],
            strokes: vec![Paint::Solid(SolidPaint {
                color: Color(30, 30, 30, 255),
                opacity: 1.0,
            })],
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        };
        
        all_arc_ids.push(arc.base.id.clone());
        repository.insert(Node::Arc(arc));
    }

    // Row 3: Clockwise rotation demonstration (0°, 45°, 90°, 135°, 180°)
    for i in 0..5 {
        let rotation_angle = i as f32 * PI / 4.0; // 0°, 45°, 90°, 135°, 180°
        
        let arc = ArcNode {
            base: BaseNode {
                id: format!("arc_rotation_{}", i),
                name: format!("Rotated Arc {}°", (rotation_angle * 180.0 / PI) as i32),
                active: true,
            },
            transform: AffineTransform::new(start_x + spacing * i as f32, start_y + 400.0, rotation_angle),
            size: Size {
                width: arc_size,
                height: arc_size,
            },
            radius_a: 0.4,
            angle_a: 0.0,
            angle_b: PI, // Half arc
            fills: vec![Paint::Solid(SolidPaint {
                color: Color(
                    (200 - i * 25) as u8,
                    150,
                    (100 + i * 30) as u8,
                    255,
                ),
                opacity: 1.0,
            })],
            strokes: vec![Paint::Solid(SolidPaint {
                color: Color(40, 40, 40, 255),
                opacity: 1.0,
            })],
            stroke_width: 1.5,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        };
        
        all_arc_ids.push(arc.base.id.clone());
        repository.insert(Node::Arc(arc));
    }

    // Row 4: Special cases and edge cases
    let special_configs = [
        (0.0, 0.0, PI / 6.0, "Thin Slice"),     // Very thin arc
        (0.9, 0.0, PI, "Thin Ring"),            // Very thin ring (high inner radius)
        (0.0, -PI / 2.0, PI / 2.0, "Centered Arc"), // Arc centered around 0°
        (0.5, PI, 2.0 * PI, "Bottom Half Ring"), // Bottom half with inner radius
        (0.2, 3.0 * PI / 2.0, PI / 2.0, "Cross Midnight"), // Arc that crosses 0° line
    ];

    for (i, (inner_radius, start_angle, end_angle, name)) in special_configs.iter().enumerate() {
        let arc = ArcNode {
            base: BaseNode {
                id: format!("arc_special_{}", i),
                name: name.to_string(),
                active: true,
            },
            transform: AffineTransform::new(start_x + spacing * i as f32, start_y + 600.0, 0.0),
            size: Size {
                width: arc_size,
                height: arc_size,
            },
            radius_a: *inner_radius,
            angle_a: *start_angle,
            angle_b: *end_angle,
            fills: vec![Paint::Solid(SolidPaint {
                color: Color(
                    150,
                    (50 + i * 40) as u8,
                    (255 - i * 40) as u8,
                    255,
                ),
                opacity: 1.0,
            })],
            strokes: vec![Paint::Solid(SolidPaint {
                color: Color(20, 20, 20, 255),
                opacity: 1.0,
            })],
            stroke_width: 2.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            effects: LayerEffects::new_empty(),
        };
        
        all_arc_ids.push(arc.base.id.clone());
        repository.insert(Node::Arc(arc));
    }

    // Add all arc IDs to the root container
    root_container_node.children = all_arc_ids;
    let root_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "golden_arc_demo".to_string(),
        name: "Golden Arc Demo".to_string(),
        children: vec![root_id],
        nodes: repository,
        background_color: Some(Color(255, 255, 255, 255)), // White background
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_arcs().await;
    window::run_demo_window(scene).await;
}