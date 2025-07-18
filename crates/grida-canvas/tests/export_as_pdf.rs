use cg::cg::types::*;
use cg::export::{export_node_as, ExportAs};
use cg::node::{factory::NodeFactory, repository::NodeRepository, schema::*};
use math2::transform::AffineTransform;

#[test]
fn test_pdf_export() {
    // Create a simple scene with a rectangle
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.name = Some("Test Rectangle".to_string());
    rect.size = Size {
        width: 100.0,
        height: 50.0,
    };
    rect.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect.fills = vec![Paint::Solid(SolidPaint {
        color: Color(255, 0, 0, 255), // Red
        opacity: 1.0,
    })];

    let rect_id = rect.id.clone();
    repo.insert(Node::Rectangle(rect));

    let scene = Scene {
        id: "test_scene".into(),
        name: "Test Scene".into(),
        children: vec![rect_id.clone()],
        nodes: repo,
        background_color: Some(Color(255, 255, 255, 255)), // White background
    };

    // Create a geometry cache to get the render bounds
    let geometry_cache = cg::cache::geometry::GeometryCache::from_scene(&scene);

    // Test PDF export
    let pdf_format = ExportAs::pdf();
    let result = export_node_as(&scene, &geometry_cache, &rect_id, pdf_format);

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
