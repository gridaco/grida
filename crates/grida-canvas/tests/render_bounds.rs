use cg::cache::geometry::GeometryCache;
use cg::cg::types::*;
use cg::node::{factory::NodeFactory, repository::NodeRepository, schema::*};
use math2::transform::AffineTransform;

#[test]
fn stroke_affects_render_bounds() {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.stroke_width = 10.0;
    rect.stroke_align = StrokeAlign::Outside;
    let rect_id = rect.base.id.clone();
    repo.insert(Node::Rectangle(rect));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        children: vec![rect_id.clone()],
        nodes: repo,
        background_color: None,
    };

    let cache = GeometryCache::from_scene(&scene);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();
    assert_eq!(bounds.x, -10.0);
    assert_eq!(bounds.y, -10.0);
    assert_eq!(bounds.width, 120.0);
    assert_eq!(bounds.height, 120.0);
}

#[test]
fn gaussian_blur_expands_render_bounds() {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.effects = vec![FilterEffect::GaussianBlur(FeGaussianBlur { radius: 5.0 })];
    let rect_id = rect.base.id.clone();
    repo.insert(Node::Rectangle(rect));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        children: vec![rect_id.clone()],
        nodes: repo,
        background_color: None,
    };

    let cache = GeometryCache::from_scene(&scene);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();
    assert_eq!(bounds.x, -5.0);
    assert_eq!(bounds.y, -5.0);
    assert_eq!(bounds.width, 110.0);
    assert_eq!(bounds.height, 110.0);
}

#[test]
fn drop_shadow_expands_render_bounds() {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.effects = vec![FilterEffect::DropShadow(FeDropShadow {
        dx: 5.0,
        dy: 5.0,
        blur: 10.0,
        spread: 0.0,
        color: Color(0, 0, 0, 255),
    })];
    let rect_id = rect.base.id.clone();
    repo.insert(Node::Rectangle(rect));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        children: vec![rect_id.clone()],
        nodes: repo,
        background_color: None,
    };

    let cache = GeometryCache::from_scene(&scene);
    let bounds = cache.get_render_bounds(&rect_id).unwrap();
    assert_eq!(bounds.x, -5.0);
    assert_eq!(bounds.y, -5.0);
    assert_eq!(bounds.width, 120.0);
    assert_eq!(bounds.height, 120.0);
}
