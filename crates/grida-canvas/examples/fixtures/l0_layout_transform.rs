use super::*;
use std::collections::HashMap;

/// Comprehensive affine transform coverage: rotations at various angles,
/// custom transform origins, nested transform composition, non-rectangular
/// shape rotations, and flips (180°).
pub fn build() -> Scene {
    // ── Row 1: Shape rotations at key angles ────────────────────────────

    // [1] Rectangle 0° (identity — baseline reference)
    let r_0 = rect_rotated(0.0, 0.0, 100.0, 60.0, 0.0, solid(200, 200, 200, 255));

    // [2] Rectangle 15° (small rotation)
    let r_15 = rect_rotated(130.0, 0.0, 100.0, 60.0, 15.0, solid(220, 59, 59, 255));

    // [3] Rectangle 45°
    let r_45 = rect_rotated(260.0, 0.0, 100.0, 60.0, 45.0, solid(59, 100, 220, 255));

    // [4] Rectangle 90°
    let r_90 = rect_rotated(390.0, 0.0, 100.0, 60.0, 90.0, solid(59, 180, 75, 255));

    // [5] Rectangle 180° (flip)
    let r_180 = rect_rotated(520.0, 0.0, 100.0, 60.0, 180.0, solid(255, 200, 40, 255));

    // [6] Rectangle 270° (equivalent to -90°)
    let r_270 = rect_rotated(650.0, 0.0, 100.0, 60.0, 270.0, solid(128, 60, 200, 255));

    // ── Row 2: Non-rectangular shapes rotated ───────────────────────────

    // [7] Ellipse rotated 30°
    let e_30 = Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(0.0, 100.0, 120.0, 60.0, 30.0),
        size: Size {
            width: 120.0,
            height: 60.0,
        },
        fills: Paints::new(vec![solid(59, 100, 220, 200)]),
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

    // [8] Line rotated 60°
    let l_60 = line(200.0, 100.0, 150.0, 60.0, 2.0);

    // [9] Line rotated -30° (330°)
    let l_neg30 = line(400.0, 100.0, 150.0, 330.0, 2.0);

    // ── Row 3: Custom transform origin ──────────────────────────────────

    // [10] Rectangle rotated 45° around CENTER (default) — for comparison
    let r_center_origin = Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        // from_box_center uses origin (0.5, 0.5)
        transform: AffineTransform::from_box_center(0.0, 220.0, 100.0, 60.0, 45.0),
        size: Size {
            width: 100.0,
            height: 60.0,
        },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(220, 59, 59, 180)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        layout_child: None,
    });

    // [11] Rectangle rotated 45° around TOP-LEFT origin (0, 0)
    let r_tl_origin = Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box(180.0, 220.0, 100.0, 60.0, 45.0, 0.0, 0.0),
        size: Size {
            width: 100.0,
            height: 60.0,
        },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(59, 100, 220, 180)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        layout_child: None,
    });

    // [12] Rectangle rotated 45° around BOTTOM-RIGHT origin (1, 1)
    let r_br_origin = Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box(360.0, 220.0, 100.0, 60.0, 45.0, 1.0, 1.0),
        size: Size {
            width: 100.0,
            height: 60.0,
        },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(59, 180, 75, 180)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        layout_child: None,
    });

    // ── Row 4: Container rotation + rotated container with child ────────

    // [13] Container rotated 90°, Cartesian position, with a child rect
    let container_90 = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 90.0,
        position: LayoutPositioningBasis::Cartesian(CGPoint::new(0.0, 360.0)),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(200.0),
            layout_target_height: Some(120.0),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(59, 100, 220, 80)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: false,
    });

    // [14] Child rect inside rotated container (inherits parent rotation)
    let child_in_90 = rect(10.0, 10.0, 80.0, 50.0, solid(220, 59, 59, 255));

    // ── Row 4 continued: Nested rotation (container 30° + child 45°) ────

    // [15] Container rotated 30°
    let container_30 = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 30.0,
        position: LayoutPositioningBasis::Cartesian(CGPoint::new(300.0, 360.0)),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(200.0),
            layout_target_height: Some(120.0),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(59, 180, 75, 80)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: false,
    });

    // [16] Child rect rotated 45° inside the 30°-rotated container
    //      World rotation = 30° + 45° = 75°
    let child_rotated_in_30 = rect_rotated(20.0, 20.0, 80.0, 50.0, 45.0, solid(128, 60, 200, 255));

    // ── Row 4 continued: Container with Inset position, rotated 45° ─────

    // [17] Container rotated 45° with Inset position
    let container_45_inset = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 45.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 360.0,
            right: 0.0,
            bottom: 0.0,
            left: 600.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(120.0),
            layout_target_height: Some(120.0),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::circular(12.0),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(255, 200, 40, 120)]),
        strokes: Paints::new(vec![solid(0, 0, 0, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: true,
    });

    // [18] Child inside clipped rotated container
    let child_in_45 = rect(10.0, 10.0, 100.0, 100.0, solid(220, 59, 59, 200));

    // ── Tree structure ──────────────────────────────────────────────────

    let pairs: Vec<(u64, Node)> = vec![
        // Row 1: rotation angles (all root-level)
        (1, r_0),
        (2, r_15),
        (3, r_45),
        (4, r_90),
        (5, r_180),
        (6, r_270),
        // Row 2: non-rect shapes (root-level)
        (7, e_30),
        (8, l_60),
        (9, l_neg30),
        // Row 3: custom origins (root-level)
        (10, r_center_origin),
        (11, r_tl_origin),
        (12, r_br_origin),
        // Row 4: containers with children
        (13, container_90),
        (14, child_in_90),
        (15, container_30),
        (16, child_rotated_in_30),
        (17, container_45_inset),
        (18, child_in_45),
    ];

    let mut links: HashMap<u64, Vec<u64>> = HashMap::new();
    links.insert(13, vec![14]); // container 90° → child
    links.insert(15, vec![16]); // container 30° → child rotated 45°
    links.insert(17, vec![18]); // container 45° inset → child

    build_scene(
        "L0 Layout Transform",
        None,
        pairs,
        links,
        vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17],
    )
}
