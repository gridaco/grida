use cg::cg::prelude::*;
use cg::export::{export_pdf_document, ExportPdfDocumentOptions, PdfPageSize};
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::resources::ByteStore;
use cg::runtime::{font_repository::FontRepository, image_repository::ImageRepository};
use math2::transform::AffineTransform;
use std::sync::{Arc, Mutex};

/// Helper: create a scene with N colored rectangles at different positions,
/// returning the scene, geometry cache, and the node IDs.
fn make_scene(
    count: usize,
) -> (
    Scene,
    cg::cache::geometry::GeometryCache,
    FontRepository,
    ImageRepository,
    Vec<math2::Rectangle>,
) {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let colors = [
        CGColor::from_rgba(255, 0, 0, 255),
        CGColor::from_rgba(0, 255, 0, 255),
        CGColor::from_rgba(0, 0, 255, 255),
        CGColor::from_rgba(255, 255, 0, 255),
        CGColor::from_rgba(255, 0, 255, 255),
    ];

    let mut node_ids = Vec::new();
    for i in 0..count {
        let mut rect = nf.create_rectangle_node();
        rect.size = Size {
            width: 1920.0,
            height: 1080.0,
        };
        // Spread slides horizontally so they don't overlap
        rect.transform = AffineTransform::new(i as f32 * 2120.0, 0.0, 0.0);
        rect.fills = Paints::new([Paint::from(colors[i % colors.len()])]);
        let id = graph.append_child(Node::Rectangle(rect), Parent::Root);
        node_ids.push(id);
    }

    let scene = Scene {
        name: "Test PDF Document".into(),
        background_color: Some(CGColor::WHITE),
        graph,
    };

    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store.clone());
    let images = ImageRepository::new(store.clone());
    let geometry = cg::cache::geometry::GeometryCache::from_scene(&scene, &fonts);

    // Resolve render bounds for each node
    let rects: Vec<math2::Rectangle> = node_ids
        .iter()
        .map(|id| {
            geometry
                .get_render_bounds(id)
                .expect("node should have bounds")
        })
        .collect();

    (scene, geometry, fonts, images, rects)
}

#[test]
fn test_pdf_document_single_page() {
    let (scene, _geometry, fonts, images, rects) = make_scene(1);

    let options = ExportPdfDocumentOptions {
        node_ids: vec!["unused".into()], // node_ids aren't used directly by export_pdf_document
        page_size: None,
    };

    let result = export_pdf_document(&scene, &fonts, &images, &rects, &options);
    assert!(result.is_some());

    let data = result.unwrap();
    let bytes = data.data();
    assert!(!bytes.is_empty());
    assert_eq!(&bytes[0..4], b"%PDF", "should start with PDF magic");
}

#[test]
fn test_pdf_document_multi_page() {
    let (scene, _geometry, fonts, images, rects) = make_scene(3);

    let options = ExportPdfDocumentOptions {
        node_ids: vec!["a".into(), "b".into(), "c".into()],
        page_size: None,
    };

    let result = export_pdf_document(&scene, &fonts, &images, &rects, &options);
    assert!(result.is_some());

    let data = result.unwrap();
    let bytes = data.data();
    assert!(!bytes.is_empty());
    assert_eq!(&bytes[0..4], b"%PDF", "should start with PDF magic");

    // A 3-page PDF should be substantially larger than a 1-page PDF.
    // Build a 1-page PDF for comparison.
    let (scene1, _, fonts1, images1, rects1) = make_scene(1);
    let options1 = ExportPdfDocumentOptions {
        node_ids: vec!["x".into()],
        page_size: None,
    };
    let single = export_pdf_document(&scene1, &fonts1, &images1, &rects1, &options1).unwrap();
    assert!(
        bytes.len() > single.data().len(),
        "3-page PDF ({} bytes) should be larger than 1-page PDF ({} bytes)",
        bytes.len(),
        single.data().len()
    );
}

#[test]
fn test_pdf_document_uniform_page_size() {
    let (scene, _geometry, fonts, images, rects) = make_scene(2);

    let options = ExportPdfDocumentOptions {
        node_ids: vec!["a".into(), "b".into()],
        page_size: Some(PdfPageSize {
            width: 800.0,
            height: 600.0,
        }),
    };

    let result = export_pdf_document(&scene, &fonts, &images, &rects, &options);
    assert!(result.is_some());

    let bytes = result.unwrap();
    assert_eq!(&bytes.data()[0..4], b"%PDF");
}

#[test]
fn test_pdf_document_empty_input() {
    let (scene, _geometry, fonts, images, _) = make_scene(1);

    let options = ExportPdfDocumentOptions {
        node_ids: vec![],
        page_size: None,
    };

    // Empty rects → should return None
    let result = export_pdf_document(&scene, &fonts, &images, &[], &options);
    assert!(result.is_none());
}
