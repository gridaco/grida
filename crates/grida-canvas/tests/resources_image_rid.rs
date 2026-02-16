//! Integration tests for add_image_with_rid (custom RID image registration).
//! Verifies the feat-resources Level 1 res:// logical-identifier path.

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};
use math2::{box_fit::BoxFit, rect::Rectangle, transform::AffineTransform};

const IMAGE_DATA: &[u8] = include_bytes!("../../../fixtures/images/4k.jpg");

#[test]
fn add_image_with_rid_succeeds_and_retrieval_works() {
    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(64, 64),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, 64.0, 64.0)),
        RendererOptions {
            use_embedded_fonts: true,
        },
    );

    let rid = "res://images/test-logo";
    let result = renderer.add_image_with_rid(IMAGE_DATA, rid);
    assert!(result.is_some(), "add_image_with_rid should succeed");
    let (width, height, _) = result.unwrap();
    assert!(width > 0 && height > 0, "image dimensions should be positive");

    let bytes = renderer.get_image_bytes(rid);
    assert!(bytes.is_some(), "get_image_bytes by full RID should return bytes");
    assert_eq!(bytes.as_ref().unwrap(), IMAGE_DATA);

    let bytes_normalized = renderer.get_image_bytes("test-logo");
    assert!(
        bytes_normalized.is_some(),
        "get_image_bytes by bare suffix should normalize to res://images/<id>"
    );
    assert_eq!(bytes_normalized.as_ref().unwrap(), IMAGE_DATA);
}

#[test]
fn add_image_with_rid_rejects_invalid_rid() {
    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(64, 64),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, 64.0, 64.0)),
        RendererOptions {
            use_embedded_fonts: true,
        },
    );

    assert!(
        renderer.add_image_with_rid(IMAGE_DATA, "invalid-no-prefix").is_none(),
        "rid without res:// or system:// should be rejected"
    );
    assert!(
        renderer.add_image_with_rid(IMAGE_DATA, "mem://abc123").is_none(),
        "mem:// is content-addressed; custom RID should use res:// or system://"
    );
}

#[test]
fn add_image_with_rid_scene_renders() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let rid = "res://images/custom-test-image";
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(0.0, 0.0, 0.0);
    rect.size = Size {
        width: 64.0,
        height: 64.0,
    };
    rect.fills = Paints::new([Paint::Image(ImagePaint {
        active: true,
        image: ResourceRef::RID(rid.to_string()),
        quarter_turns: 0,
        alignement: Alignment::CENTER,
        fit: ImagePaintFit::Fit(BoxFit::Cover),
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        filters: ImageFilters::default(),
    })]);

    graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "Image RID Test".into(),
        graph,
        background_color: Some(CGColor::from_rgba(255, 255, 255, 255)),
    };

    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(64, 64),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, 64.0, 64.0)),
        RendererOptions {
            use_embedded_fonts: true,
        },
    );

    let result = renderer.add_image_with_rid(IMAGE_DATA, rid);
    assert!(result.is_some(), "must register image before load_scene");

    renderer.load_scene(scene);
    let surface = unsafe { &mut *renderer.backend.get_surface() };
    let canvas = surface.canvas();
    renderer.render_to_canvas(canvas, 64.0, 64.0);

    let snapshot = surface.image_snapshot();
    let data = snapshot
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    assert!(!data.as_bytes().is_empty(), "render should produce output");
}
