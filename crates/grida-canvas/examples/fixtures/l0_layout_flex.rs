use super::*;
use std::collections::HashMap;

pub fn build() -> Scene {
    // Horizontal flex container: SpaceBetween, Center
    let h_container = Node::Container(ContainerNodeRec {
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
        layout_container: LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_wrap: Some(LayoutWrap::NoWrap),
            layout_main_axis_alignment: Some(MainAxisAlignment::SpaceBetween),
            layout_cross_axis_alignment: Some(CrossAxisAlignment::Center),
            layout_padding: None,
            layout_gap: Some(LayoutGap {
                main_axis_gap: 10.0,
                cross_axis_gap: 0.0,
            }),
        },
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(500.0),
            layout_target_height: Some(80.0),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(240, 240, 245, 255)]),
        strokes: Paints::new(vec![solid(200, 200, 210, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: false,
    });

    let h1 = rect(0.0, 0.0, 100.0, 50.0, solid(220, 59, 59, 255));
    let h2 = rect(0.0, 0.0, 100.0, 50.0, solid(59, 100, 220, 255));
    // flex_grow=1
    let h3 = Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(0.0, 0.0, 100.0, 50.0, 0.0),
        size: Size {
            width: 100.0,
            height: 50.0,
        },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(59, 180, 75, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects::default(),
        layout_child: Some(LayoutChildStyle {
            layout_grow: 1.0,
            layout_positioning: LayoutPositioning::Auto,
        }),
    });

    // Vertical flex container: Center, Stretch
    let v_container = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 100.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
        }),
        layout_container: LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Vertical,
            layout_wrap: Some(LayoutWrap::NoWrap),
            layout_main_axis_alignment: Some(MainAxisAlignment::Center),
            layout_cross_axis_alignment: Some(CrossAxisAlignment::Stretch),
            layout_padding: Some(EdgeInsets {
                top: 16.0,
                right: 16.0,
                bottom: 16.0,
                left: 16.0,
            }),
            layout_gap: Some(LayoutGap {
                main_axis_gap: 8.0,
                cross_axis_gap: 0.0,
            }),
        },
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(200.0),
            layout_target_height: Some(200.0),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(245, 240, 240, 255)]),
        strokes: Paints::new(vec![solid(210, 200, 200, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: false,
    });

    let v1 = rect(0.0, 0.0, 80.0, 40.0, solid(255, 200, 40, 255));
    let v2 = rect(0.0, 0.0, 80.0, 40.0, solid(128, 60, 200, 255));

    let mut links = HashMap::new();
    links.insert(1u64, vec![2u64, 3u64, 4u64]);
    links.insert(5u64, vec![6u64, 7u64]);

    build_scene(
        "L0 Layout Flex",
        None,
        vec![
            (1, h_container),
            (2, h1),
            (3, h2),
            (4, h3),
            (5, v_container),
            (6, v1),
            (7, v2),
        ],
        links,
        vec![1, 5],
    )
}
