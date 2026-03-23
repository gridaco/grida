use super::*;
use cg::cg::stroke_width::SingularStrokeWidth;
use math2::transform::AffineTransform;
use std::collections::HashMap;

pub fn build() -> Scene {
    // Group 1: image mask (alpha)
    let group_img = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_box_center(0.0, 0.0, 0.0, 0.0, 0.0)),
    });
    let content_img = rect(0.0, 0.0, 100.0, 100.0, solid(220, 59, 59, 255));
    let mask_img = Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: Some(LayerMaskType::Image(ImageMaskType::Alpha)),
        transform: AffineTransform::from_box_center(0.0, 0.0, 100.0, 100.0, 0.0),
        size: Size {
            width: 100.0,
            height: 100.0,
        },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(255, 255, 255, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects::default(),
        layout_child: None,
    });

    // Group 2: geometry mask
    let group_geo = Node::Group(GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: Some(AffineTransform::from_box_center(150.0, 0.0, 0.0, 0.0, 0.0)),
    });
    let content_geo = rect(0.0, 0.0, 100.0, 100.0, solid(59, 100, 220, 255));
    let mask_geo = Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: Some(LayerMaskType::Geometry),
        transform: AffineTransform::from_box_center(10.0, 10.0, 80.0, 80.0, 0.0),
        size: Size {
            width: 80.0,
            height: 80.0,
        },
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        inner_radius: None,
        start_angle: 0.0,
        angle: None,
        corner_radius: None,
        effects: LayerEffects::default(),
        layout_child: None,
    });

    let mut links = HashMap::new();
    links.insert(1u64, vec![2u64, 3u64]);
    links.insert(4u64, vec![5u64, 6u64]);

    build_scene(
        "L0 Masks",
        None,
        vec![
            (1, group_img),
            (2, content_img),
            (3, mask_img),
            (4, group_geo),
            (5, content_geo),
            (6, mask_geo),
        ],
        links,
        vec![1, 4],
    )
}
