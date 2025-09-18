use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::vectornetwork::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_vectors() -> Scene {
    let nf = NodeFactory::new();
    let mut repository = NodeRepository::new();

    // Root container
    let mut root = nf.create_container_node();
    root.name = Some("Root".to_string());
    root.size = Size {
        width: 1200.0,
        height: 800.0,
    };

    let mut ids = Vec::new();
    let spacing = 200.0;
    let start_x = 100.0;
    let base_y = 100.0;

    {
        {
            let vector_node_1_tri_open = VectorNodeRec {
                id: "1".to_string(),
                name: Some("triangle open".to_string()),
                active: true,
                transform: AffineTransform::new(start_x, base_y, 0.0),
                fills: Paints::default(),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment::ab(0, 1),
                        VectorNetworkSegment::ab(1, 2),
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: Paints::new([Paint::from(CGColor::RED)]),
                stroke_width: 3.0,
                stroke_width_profile: None,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                effects: LayerEffects::default(),
            };

            ids.push(vector_node_1_tri_open.id.clone());
            repository.insert(Node::Vector(vector_node_1_tri_open));
        }

        {
            let vector_node_2_tri_closed = VectorNodeRec {
                id: "2".to_string(),
                name: Some("triangle closed".to_string()),
                active: true,
                transform: AffineTransform::new(start_x + spacing * 1.0, base_y, 0.0),
                fills: Paints::default(),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment::ab(0, 1),
                        VectorNetworkSegment::ab(1, 2),
                        VectorNetworkSegment::ab(2, 0),
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: Paints::new([Paint::from(CGColor::RED)]),
                stroke_width: 3.0,
                stroke_width_profile: None,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                effects: LayerEffects::default(),
            };

            ids.push(vector_node_2_tri_closed.id.clone());
            repository.insert(Node::Vector(vector_node_2_tri_closed));
        }

        //
        {
            let vector_node_3 = VectorNodeRec {
                id: "3".to_string(),
                name: Some("Vector 2".to_string()),
                active: true,
                transform: AffineTransform::new(start_x + spacing * 2.0, base_y, 0.0),
                fills: Paints::default(),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 100.0), (0.0, 100.0), (100.0, 0.0)],
                    segments: vec![
                        VectorNetworkSegment::ab(0, 1),
                        VectorNetworkSegment::ab(1, 2),
                        VectorNetworkSegment::ab(2, 3),
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: Paints::new([Paint::from(CGColor(255, 0, 0, 255))]),
                stroke_width: 3.0,
                stroke_width_profile: None,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                effects: LayerEffects::default(),
            };

            ids.push(vector_node_3.id.clone());
            repository.insert(Node::Vector(vector_node_3));
        }

        {
            let vector_node_4 = VectorNodeRec {
                id: "vector_3".to_string(),
                name: Some("Vector 3".to_string()),
                active: true,
                transform: AffineTransform::new(start_x + spacing * 3.0, base_y, 0.0),
                fills: Paints::default(),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 0.0), (0.0, 100.0), (100.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment::ab(0, 1),
                        VectorNetworkSegment::ab(1, 2),
                        VectorNetworkSegment::ab(2, 3),
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: Paints::new([Paint::from(CGColor::RED)]),
                stroke_width: 3.0,
                stroke_width_profile: None,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                effects: LayerEffects::default(),
            };

            ids.push(vector_node_4.id.clone());
            repository.insert(Node::Vector(vector_node_4));
        }

        // FIXME: not working
        {
            let vector_node_1_5 = VectorNodeRec {
                id: "1_5".to_string(),
                name: Some("Vector 1_5".to_string()),
                active: true,
                transform: AffineTransform::new(start_x + spacing * 4.0, base_y, 0.0),
                fills: Paints::default(),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 0.0), (0.0, 100.0), (100.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment::ab(0, 1),
                        VectorNetworkSegment::ab(1, 2),
                        VectorNetworkSegment::ab(2, 3),
                        // FIXME: this is not working
                        VectorNetworkSegment::ab(3, 0),
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: Paints::new([Paint::from(CGColor::RED)]),
                stroke_width: 3.0,
                stroke_width_profile: None,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                effects: LayerEffects::default(),
            };

            ids.push(vector_node_1_5.id.clone());
            repository.insert(Node::Vector(vector_node_1_5));
        }
    }

    // row 2
    {
        // Simple curve (S-shape)
        {
            let vector_node_5 = VectorNodeRec {
                id: "5".to_string(),
                name: Some("S-curve".to_string()),
                active: true,
                transform: AffineTransform::new(
                    start_x + spacing * 0.0,
                    base_y + spacing * 1.0,
                    0.0,
                ),
                fills: Paints::default(),
                network: VectorNetwork {
                    vertices: vec![(0.0, 50.0), (100.0, 50.0)],
                    segments: vec![VectorNetworkSegment {
                        a: 0,
                        b: 1,
                        ta: (30.0, -30.0), // Tangent handle from start point
                        tb: (-30.0, 30.0), // Tangent handle to end point
                    }],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: Paints::new([Paint::from(CGColor(0, 100, 255, 255))]),
                stroke_width: 3.0,
                stroke_width_profile: None,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                effects: LayerEffects::default(),
            };

            ids.push(vector_node_5.id.clone());
            repository.insert(Node::Vector(vector_node_5));
        }

        // Single-segment 90-degree straight line
        {
            let vector_node_5_5 = VectorNodeRec {
                id: "5_5".to_string(),
                name: Some("90deg line".to_string()),
                active: true,
                transform: AffineTransform::new(
                    start_x + spacing * 1.0,
                    base_y + spacing * 1.0,
                    0.0,
                ),
                fills: Paints::default(),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 0.0)],
                    segments: vec![VectorNetworkSegment::ab(0, 1)],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: Paints::new([Paint::from(CGColor(0, 100, 255, 255))]),
                stroke_width: 3.0,
                stroke_width_profile: None,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                effects: LayerEffects::default(),
            };

            ids.push(vector_node_5_5.id.clone());
            repository.insert(Node::Vector(vector_node_5_5));
        }
    }

    // row 3 - shapes with fills
    {
        // Filled triangle
        {
            let vector_node_6 = VectorNodeRec {
                id: "6".to_string(),
                name: Some("filled triangle".to_string()),
                active: true,
                transform: AffineTransform::new(
                    start_x + spacing * 0.0,
                    base_y + spacing * 2.0,
                    0.0,
                ),
                fills: Paints::new([Paint::from(CGColor(255, 100, 100, 255))]),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment::ab(0, 1),
                        VectorNetworkSegment::ab(1, 2),
                        VectorNetworkSegment::ab(2, 0),
                    ],
                    regions: vec![],
                },
                corner_radius: 4.0,
                strokes: Paints::new([Paint::from(CGColor(200, 0, 0, 255))]),
                stroke_width: 2.0,
                stroke_width_profile: None,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                effects: LayerEffects::default(),
            };

            ids.push(vector_node_6.id.clone());
            repository.insert(Node::Vector(vector_node_6));
        }

        // Filled rectangle
        {
            let vector_node_7 = VectorNodeRec {
                id: "7".to_string(),
                name: Some("filled rectangle".to_string()),
                active: true,
                transform: AffineTransform::new(
                    start_x + spacing * 1.0,
                    base_y + spacing * 2.0,
                    0.0,
                ),
                fills: Paints::new([Paint::from(CGColor(100, 255, 100, 255))]),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment::ab(0, 1),
                        VectorNetworkSegment::ab(1, 2),
                        VectorNetworkSegment::ab(2, 3),
                        VectorNetworkSegment::ab(3, 0),
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: Paints::new([Paint::from(CGColor(0, 150, 0, 255))]),
                stroke_width: 2.0,
                stroke_width_profile: None,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: LayerBlendMode::default(),
                effects: LayerEffects::default(),
            };

            ids.push(vector_node_7.id.clone());
            repository.insert(Node::Vector(vector_node_7));
        }
    }

    // Add all nodes to root
    root.children = ids.clone();
    let root_id = root.id.clone();
    repository.insert(Node::Container(root));

    Scene {
        id: "scene".to_string(),
        name: "Vector Network Demo".to_string(),
        children: vec![root_id],
        nodes: repository,
        background_color: Some(CGColor(240, 240, 240, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_vectors().await;
    window::run_demo_window(scene).await;
}
