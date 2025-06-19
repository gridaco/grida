use cg::cache::scene::SceneCache;
use cg::hit_test::HitTester;
use cg::node::{factory::NodeFactory, repository::NodeRepository, schema::*};
use math2::transform::AffineTransform;

#[test]
fn hit_first_returns_topmost() {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(10.0, 10.0, 0.0);
    rect.size = Size {
        width: 20.0,
        height: 20.0,
    };
    let rect_id = rect.base.id.clone();
    repo.insert(Node::Rectangle(rect));

    let mut container = nf.create_container_node();
    container.size = Size {
        width: 40.0,
        height: 40.0,
    };
    let container_id = container.base.id.clone();
    container.children.push(rect_id.clone());
    repo.insert(Node::Container(container));

    let scene = Scene {
        id: "scene".into(),
        name: "test".into(),
        transform: AffineTransform::identity(),
        children: vec![container_id.clone()],
        nodes: repo,
        background_color: None,
    };

    let mut cache = SceneCache::new();
    cache.update_geometry(&scene);
    cache.update_layers(&scene);

    let tester = HitTester::new(&cache);

    assert_eq!(
        tester.hit_first([15.0, 15.0]).as_deref(),
        Some(rect_id.as_str())
    );
    assert_eq!(
        tester.hit_first([5.0, 5.0]).as_deref(),
        Some(container_id.as_str())
    );
    assert!(tester.hit_first([100.0, 100.0]).is_none());
}
