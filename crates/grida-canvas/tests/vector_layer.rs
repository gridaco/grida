use cg::cache::geometry::GeometryCache;
use cg::cg::types::*;
use cg::cg::CGColor;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::painter::layer::LayerList;
use cg::vectornetwork::vn::{
    VectorNetwork, VectorNetworkLoop, VectorNetworkRegion, VectorNetworkSegment,
};
use math2::transform::AffineTransform;

#[test]
fn test_vector_layer_creation() {
    // Create a simple vector network
    let mut vn = VectorNetwork::default();
    vn.vertices.push((0.0, 0.0));
    vn.vertices.push((100.0, 0.0));
    vn.vertices.push((100.0, 100.0));
    vn.vertices.push((0.0, 100.0));
    vn.segments.push(VectorNetworkSegment {
        a: 0,
        b: 1,
        ta: None,
        tb: None,
    });
    vn.segments.push(VectorNetworkSegment {
        a: 1,
        b: 2,
        ta: None,
        tb: None,
    });
    vn.segments.push(VectorNetworkSegment {
        a: 2,
        b: 3,
        ta: None,
        tb: None,
    });
    vn.segments.push(VectorNetworkSegment {
        a: 3,
        b: 0,
        ta: None,
        tb: None,
    });

    // Create a region with a loop
    vn.regions.push(VectorNetworkRegion {
        loops: vec![VectorNetworkLoop(vec![0, 1, 2, 3])],
        fill_rule: FillRule::EvenOdd,
        fills: Some(vec![Paint::Solid(SolidPaint {
            color: CGColor(255, 0, 0, 255),
            opacity: 1.0,
        })]),
    });

    // Create a vector node
    let vector_node = VectorNode {
        id: "test_vector".to_string(),
        name: Some("Test Vector".to_string()),
        active: true,
        transform: AffineTransform::identity(),
        network: vn,
        corner_radius: 0.0,
        fill: Some(Paint::Solid(SolidPaint {
            color: CGColor(255, 0, 0, 255),
            opacity: 1.0,
        })),
        strokes: vec![],
        stroke_width: 2.0,
        stroke_width_profile: None,
        stroke_align: StrokeAlign::Inside,
        stroke_dash_array: None,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        effects: LayerEffects::new_empty(),
    };

    // Create a node repository and add the vector node
    let mut repo = NodeRepository::new();
    repo.insert(Node::Vector(vector_node));

    // Create a scene and geometry cache
    let scene = Scene {
        id: "scene".to_string(),
        name: "test".to_string(),
        children: vec!["test_vector".to_string()],
        nodes: repo.clone(),
        background_color: None,
    };
    let cache = GeometryCache::from_scene(&scene);

    // Create a layer list from the vector node
    let layer_list = LayerList::from_node(&"test_vector".to_string(), &repo, &cache, 1.0);

    // Verify that we have exactly one layer
    assert_eq!(layer_list.len(), 1);

    // Verify that the layer is a Vector layer
    match &layer_list.layers[0] {
        cg::painter::layer::PainterPictureLayer::Vector(vector_layer) => {
            assert_eq!(vector_layer.base.id, "test_vector");
            assert_eq!(vector_layer.stroke_width, 2.0);
            assert_eq!(vector_layer.stroke_align, StrokeAlign::Inside);
            assert_eq!(vector_layer.fills.len(), 1);
        }
        _ => panic!("Expected Vector layer, got different layer type"),
    }
}
