use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::shape::*;
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
            let vector_node_1_tri_open = VectorNode {
                id: "1".to_string(),
                name: Some("triangle open".to_string()),
                active: true,
                transform: AffineTransform::new(start_x, base_y, 0.0),
                fill: None,
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment {
                            a: 0,
                            b: 1,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 1,
                            b: 2,
                            ta: None,
                            tb: None,
                        },
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: vec![Paint::Solid(SolidPaint::red())],
                stroke_width: 3.0,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                effects: LayerEffects::new_empty(),
            };

            ids.push(vector_node_1_tri_open.id.clone());
            repository.insert(Node::Vector(vector_node_1_tri_open));
        }

        {
            let vector_node_2_tri_closed = VectorNode {
                id: "2".to_string(),
                name: Some("triangle closed".to_string()),
                active: true,
                transform: AffineTransform::new(start_x + spacing * 1.0, base_y, 0.0),
                fill: None,
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment {
                            a: 0,
                            b: 1,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 1,
                            b: 2,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 2,
                            b: 0,
                            ta: None,
                            tb: None,
                        },
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: vec![Paint::Solid(SolidPaint::red())],
                stroke_width: 3.0,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                effects: LayerEffects::new_empty(),
            };

            ids.push(vector_node_2_tri_closed.id.clone());
            repository.insert(Node::Vector(vector_node_2_tri_closed));
        }

        //
        {
            let vector_node_3 = VectorNode {
                id: "3".to_string(),
                name: Some("Vector 2".to_string()),
                active: true,
                transform: AffineTransform::new(start_x + spacing * 2.0, base_y, 0.0),
                fill: None,
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 100.0), (0.0, 100.0), (100.0, 0.0)],
                    segments: vec![
                        VectorNetworkSegment {
                            a: 0,
                            b: 1,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 1,
                            b: 2,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 2,
                            b: 3,
                            ta: None,
                            tb: None,
                        },
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: vec![Paint::Solid(SolidPaint {
                    color: CGColor(255, 0, 0, 255),
                    opacity: 1.0,
                })],
                stroke_width: 3.0,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                effects: LayerEffects::new_empty(),
            };

            ids.push(vector_node_3.id.clone());
            repository.insert(Node::Vector(vector_node_3));
        }

        {
            let vector_node_4 = VectorNode {
                id: "vector_3".to_string(),
                name: Some("Vector 3".to_string()),
                active: true,
                transform: AffineTransform::new(start_x + spacing * 3.0, base_y, 0.0),
                fill: None,
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 0.0), (0.0, 100.0), (100.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment {
                            a: 0,
                            b: 1,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 1,
                            b: 2,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 2,
                            b: 3,
                            ta: None,
                            tb: None,
                        },
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: vec![Paint::Solid(SolidPaint::red())],
                stroke_width: 3.0,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                effects: LayerEffects::new_empty(),
            };

            ids.push(vector_node_4.id.clone());
            repository.insert(Node::Vector(vector_node_4));
        }

        // FIXME: not working
        {
            let vector_node_1_5 = VectorNode {
                id: "1_5".to_string(),
                name: Some("Vector 1_5".to_string()),
                active: true,
                transform: AffineTransform::new(start_x + spacing * 4.0, base_y, 0.0),
                fill: None,
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 0.0), (0.0, 100.0), (100.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment {
                            a: 0,
                            b: 1,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 1,
                            b: 2,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 2,
                            b: 3,
                            ta: None,
                            tb: None,
                        },
                        // FIXME: this is not working
                        VectorNetworkSegment {
                            a: 3,
                            b: 0,
                            ta: None,
                            tb: None,
                        },
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: vec![Paint::Solid(SolidPaint::red())],
                stroke_width: 3.0,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                effects: LayerEffects::new_empty(),
            };

            ids.push(vector_node_1_5.id.clone());
            repository.insert(Node::Vector(vector_node_1_5));
        }
    }

    // row 2
    {
        // Simple curve (S-shape)
        {
            let vector_node_5 = VectorNode {
                id: "5".to_string(),
                name: Some("S-curve".to_string()),
                active: true,
                transform: AffineTransform::new(
                    start_x + spacing * 0.0,
                    base_y + spacing * 1.0,
                    0.0,
                ),
                fill: None,
                network: VectorNetwork {
                    vertices: vec![(0.0, 50.0), (100.0, 50.0)],
                    segments: vec![VectorNetworkSegment {
                        a: 0,
                        b: 1,
                        ta: Some((30.0, -30.0)), // Tangent handle from start point
                        tb: Some((-30.0, 30.0)), // Tangent handle to end point
                    }],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: vec![Paint::Solid(SolidPaint {
                    color: CGColor(0, 100, 255, 255),
                    opacity: 1.0,
                })],
                stroke_width: 3.0,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                effects: LayerEffects::new_empty(),
            };

            ids.push(vector_node_5.id.clone());
            repository.insert(Node::Vector(vector_node_5));
        }
    }

    // row 3 - shapes with fills
    {
        // Filled triangle
        {
            let vector_node_6 = VectorNode {
                id: "6".to_string(),
                name: Some("filled triangle".to_string()),
                active: true,
                transform: AffineTransform::new(
                    start_x + spacing * 0.0,
                    base_y + spacing * 2.0,
                    0.0,
                ),
                fill: Some(Paint::Solid(SolidPaint {
                    color: CGColor(255, 100, 100, 255),
                    opacity: 1.0,
                })),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment {
                            a: 0,
                            b: 1,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 1,
                            b: 2,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 2,
                            b: 0,
                            ta: None,
                            tb: None,
                        },
                    ],
                    regions: vec![],
                },
                corner_radius: 4.0,
                strokes: vec![Paint::Solid(SolidPaint {
                    color: CGColor(200, 0, 0, 255),
                    opacity: 1.0,
                })],
                stroke_width: 2.0,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                effects: LayerEffects::new_empty(),
            };

            ids.push(vector_node_6.id.clone());
            repository.insert(Node::Vector(vector_node_6));
        }

        // Filled rectangle
        {
            let vector_node_7 = VectorNode {
                id: "7".to_string(),
                name: Some("filled rectangle".to_string()),
                active: true,
                transform: AffineTransform::new(
                    start_x + spacing * 1.0,
                    base_y + spacing * 2.0,
                    0.0,
                ),
                fill: Some(Paint::Solid(SolidPaint {
                    color: CGColor(100, 255, 100, 255),
                    opacity: 1.0,
                })),
                network: VectorNetwork {
                    vertices: vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)],
                    segments: vec![
                        VectorNetworkSegment {
                            a: 0,
                            b: 1,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 1,
                            b: 2,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 2,
                            b: 3,
                            ta: None,
                            tb: None,
                        },
                        VectorNetworkSegment {
                            a: 3,
                            b: 0,
                            ta: None,
                            tb: None,
                        },
                    ],
                    regions: vec![],
                },
                corner_radius: 0.0,
                strokes: vec![Paint::Solid(SolidPaint {
                    color: CGColor(0, 150, 0, 255),
                    opacity: 1.0,
                })],
                stroke_width: 2.0,
                stroke_align: StrokeAlign::Center,
                stroke_dash_array: None,
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                effects: LayerEffects::new_empty(),
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
