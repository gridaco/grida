use super::*;
use std::collections::HashMap;

pub fn build() -> Scene {
    let container = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
        }),
        layout_container: LayoutContainerStyle::default(), // Normal mode
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(400.0),
            layout_target_height: Some(300.0),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(245, 245, 245, 255)]),
        strokes: Paints::new(vec![solid(200, 200, 200, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: false,
    });

    // Child at Cartesian (20, 20)
    let c1 = rect(20.0, 20.0, 80.0, 60.0, solid(220, 59, 59, 255));

    // Child at Inset (top=50, left=150) — same x,y via inset
    let c2 = rect(150.0, 50.0, 80.0, 60.0, solid(59, 100, 220, 255));

    // Child with layout_child Absolute positioning
    let c3 = Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(20.0, 150.0, 80.0, 60.0, 0.0),
        size: Size {
            width: 80.0,
            height: 60.0,
        },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(59, 180, 75, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects::default(),
        layout_child: Some(LayoutChildStyle {
            layout_grow: 0.0,
            layout_positioning: LayoutPositioning::Absolute,
        }),
    });

    let mut links = HashMap::new();
    links.insert(1u64, vec![2u64, 3u64, 4u64]);

    build_scene(
        "L0 Layout Position",
        None,
        vec![(1, container), (2, c1), (3, c2), (4, c3)],
        links,
        vec![1],
    )
}
