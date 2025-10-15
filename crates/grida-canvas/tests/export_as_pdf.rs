use cg::cg::types::*;
use cg::export::{export_node_as, ExportAs};
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::resources::ByteStore;
use cg::runtime::{font_repository::FontRepository, image_repository::ImageRepository};
use math2::transform::AffineTransform;
use std::sync::{Arc, Mutex};

#[test]
fn test_pdf_export() {
    // Create a simple scene with a rectangle
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.name = Some("Test Rectangle".to_string());
    rect.size = Size {
        width: 100.0,
        height: 50.0,
    };
    rect.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect.fills = Paints::new([Paint::from(CGColor(255, 0, 0, 255))]);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "Test Scene".into(),
        background_color: Some(CGColor(255, 255, 255, 255)), // White background
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store.clone());
    let images = ImageRepository::new(store.clone());

    // Create a geometry cache to get the render bounds
    let geometry_cache = cg::cache::geometry::GeometryCache::from_scene(&scene, &fonts);

    // Test PDF export
    let pdf_format = ExportAs::pdf();
    let result = export_node_as(
        &scene,
        &geometry_cache,
        &fonts,
        &images,
        &rect_id,
        pdf_format,
    );

    // Verify that we got a PDF result
    assert!(result.is_some());
    let exported = result.unwrap();

    // Verify it's a PDF
    match exported {
        cg::export::Exported::PDF(data) => {
            // Check that we have some data
            assert!(!data.is_empty());

            // Check that it starts with PDF magic bytes
            assert_eq!(&data[0..4], b"%PDF");
        }
        _ => panic!("Expected PDF export, got different format"),
    }
}
