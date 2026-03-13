use super::*;

pub fn build() -> Scene {
    // Container rotated 90°, Cartesian position
    let rotated_container = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 90.0,
        position: LayoutPositioningBasis::Cartesian(CGPoint::new(300.0, 50.0)),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(200.0),
            layout_target_height: Some(150.0),
            layout_min_width: None, layout_max_width: None,
            layout_min_height: None, layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(59, 100, 220, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects::default(),
        clip: false,
    });

    // Rectangle rotated 45°
    let rotated_rect = rect_rotated(50.0, 50.0, 120.0, 80.0, 45.0, solid(220, 59, 59, 255));

    // Line rotated 45°
    let rotated_line = line(400.0, 200.0, 200.0, 45.0, 2.0);

    flat_scene("L0 Layout Transform", vec![rotated_container, rotated_rect, rotated_line])
}
