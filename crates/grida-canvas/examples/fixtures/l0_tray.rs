use super::*;
use std::collections::HashMap;

/// Helper: create a Container node at (x, y) with given size and fill color.
fn frame(x: f32, y: f32, w: f32, h: f32, fill: Paint) -> Node {
    Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: y,
            right: 0.0,
            bottom: 0.0,
            left: x,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(w),
            layout_target_height: Some(h),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![fill]),
        strokes: Paints::default(),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(0.0),
        effects: LayerEffects::default(),
        clip: true,
    })
}

/// Helper: create a Container with rounded corners.
fn frame_rounded(x: f32, y: f32, w: f32, h: f32, fill: Paint, radius: f32) -> Node {
    Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: y,
            right: 0.0,
            bottom: 0.0,
            left: x,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(w),
            layout_target_height: Some(h),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: {
            use cg::cg::types::Radius;
            let r = Radius::circular(radius);
            RectangularCornerRadius {
                tl: r,
                tr: r,
                bl: r,
                br: r,
            }
        },
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![fill]),
        strokes: Paints::default(),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(0.0),
        effects: LayerEffects::default(),
        clip: true,
    })
}

/// Helper: create a Tray node.
fn tray(
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    fill: Paint,
    stroke: Paint,
    stroke_w: f32,
    radius: f32,
    opacity: f32,
) -> Node {
    Node::Tray(TrayNodeRec {
        active: true,
        opacity,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: y,
            right: 0.0,
            bottom: 0.0,
            left: x,
        }),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(w),
            layout_target_height: Some(h),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        corner_radius: if radius > 0.0 {
            use cg::cg::types::Radius;
            let r = Radius::circular(radius);
            RectangularCornerRadius {
                tl: r,
                tr: r,
                bl: r,
                br: r,
            }
        } else {
            RectangularCornerRadius::default()
        },
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![fill]),
        strokes: Paints::new(vec![stroke]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(stroke_w),
    })
}

/// Tray node features: explicit dimensions, fills, strokes, corner radius,
/// container children treated as root-level frames (no clipping, no effects, no layout).
pub fn build() -> Scene {
    // ── [1] Tray with two container children ──────────────────────────────
    // Simulates a Figma SECTION holding two frames side by side.
    let tray1 = tray(
        0.0,
        0.0,
        500.0,
        250.0,
        solid(245, 245, 250, 255), // light grey-blue fill
        solid(180, 180, 200, 255), // grey border
        1.0,
        0.0,
        1.0,
    );
    let frame1a = frame_rounded(20.0, 30.0, 200.0, 180.0, solid(255, 255, 255, 255), 8.0);
    let frame1b = frame_rounded(260.0, 30.0, 200.0, 180.0, solid(59, 100, 220, 255), 8.0);

    // ── [4] Tray with rounded corners and nested containers ───────────────
    // Demonstrates Tray corner_radius + containers inside.
    let tray2 = tray(
        540.0,
        0.0,
        400.0,
        250.0,
        solid(240, 248, 255, 255), // alice blue fill
        solid(100, 149, 237, 255), // cornflower blue border
        2.0,
        16.0,
        1.0,
    );
    // Three card-like containers inside
    let card_a = frame_rounded(20.0, 30.0, 100.0, 180.0, solid(255, 240, 240, 255), 6.0);
    let card_b = frame_rounded(140.0, 30.0, 100.0, 180.0, solid(240, 255, 240, 255), 6.0);
    let card_c = frame_rounded(260.0, 30.0, 100.0, 180.0, solid(240, 240, 255, 255), 6.0);

    // ── [8] Tray with overflowing container (no clip) ─────────────────────
    // Demonstrates that Tray never clips its children, unlike Container.
    let tray3 = tray(
        0.0,
        290.0,
        250.0,
        180.0,
        solid(255, 250, 240, 255), // linen fill
        solid(200, 180, 150, 255), // tan border
        1.0,
        0.0,
        1.0,
    );
    // Container intentionally overflows the tray bounds — should be fully visible.
    let overflow_frame = frame(80.0, 60.0, 250.0, 160.0, solid(59, 180, 75, 200));

    // ── [10] Tray at 50% opacity with container children ──────────────────
    let tray4 = tray(
        300.0,
        290.0,
        250.0,
        180.0,
        solid(255, 220, 220, 255), // light red fill
        solid(220, 100, 100, 255), // red border
        2.0,
        8.0,
        0.5,
    );
    let frame4a = frame_rounded(15.0, 30.0, 100.0, 120.0, solid(128, 60, 200, 255), 6.0);
    let frame4b = frame_rounded(130.0, 30.0, 100.0, 120.0, solid(200, 60, 128, 255), 6.0);

    // ── [13] Empty tray (no children) ─────────────────────────────────────
    // A valid tray with no content — a named region waiting for frames.
    let tray5 = tray(
        600.0,
        290.0,
        200.0,
        180.0,
        solid(230, 230, 230, 255), // light grey fill
        solid(160, 160, 160, 255), // grey border
        1.0,
        0.0,
        1.0,
    );

    // ── Tree ────────────────────────────────────────────────────────────
    let mut links = HashMap::new();
    links.insert(1u64, vec![2u64, 3]); // tray1 → frame1a, frame1b
    links.insert(4u64, vec![5, 6, 7]); // tray2 → card_a, card_b, card_c
    links.insert(8u64, vec![9u64]); // tray3 → overflow_frame
    links.insert(10u64, vec![11, 12]); // tray4 → frame4a, frame4b
                                       // tray5 (13) has no children

    build_scene(
        "L0 Tray",
        None,
        vec![
            (1, tray1),
            (2, frame1a),
            (3, frame1b),
            (4, tray2),
            (5, card_a),
            (6, card_b),
            (7, card_c),
            (8, tray3),
            (9, overflow_frame),
            (10, tray4),
            (11, frame4a),
            (12, frame4b),
            (13, tray5),
        ],
        links,
        vec![1, 4, 8, 10, 13],
    )
}
