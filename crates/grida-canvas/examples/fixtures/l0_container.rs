use super::*;
use std::collections::HashMap;

/// Container-specific features: clip on/off, nesting, InitialContainer.
pub fn build() -> Scene {
    // ── [1] Outer container (clip=true) ─────────────────────────────────
    // Child rectangle intentionally overflows to demonstrate clipping.
    let clip_on = Node::Container(ContainerNodeRec {
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
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(200.0),
            layout_target_height: Some(150.0),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: {
            use cg::cg::types::Radius;
            let r = Radius::circular(12.0);
            RectangularCornerRadius {
                tl: r,
                tr: r,
                bl: r,
                br: r,
            }
        },
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(235, 240, 255, 255)]),
        strokes: Paints::new(vec![solid(100, 120, 200, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: true,
    });

    // Overflowing child — should be clipped by parent
    let overflow_rect = rect(60.0, 80.0, 200.0, 120.0, solid(220, 59, 59, 200));

    // ── [3] Same container but clip=false ───────────────────────────────
    let clip_off = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 240.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(200.0),
            layout_target_height: Some(150.0),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: {
            use cg::cg::types::Radius;
            let r = Radius::circular(12.0);
            RectangularCornerRadius {
                tl: r,
                tr: r,
                bl: r,
                br: r,
            }
        },
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(235, 255, 240, 255)]),
        strokes: Paints::new(vec![solid(100, 200, 120, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: false,
    });

    // Same overflowing child — should be visible beyond parent bounds
    let overflow_rect2 = rect(60.0, 80.0, 200.0, 120.0, solid(59, 180, 75, 200));

    // ── [5] Nested containers (3 levels deep) ──────────────────────────
    let outer = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 180.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(400.0),
            layout_target_height: Some(250.0),
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
        strokes: Paints::new(vec![solid(180, 180, 180, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: false,
    });

    let middle = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 0.9,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 20.0,
            right: 0.0,
            bottom: 0.0,
            left: 20.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(300.0),
            layout_target_height: Some(180.0),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: {
            use cg::cg::types::Radius;
            let r = Radius::circular(8.0);
            RectangularCornerRadius {
                tl: r,
                tr: r,
                bl: r,
                br: r,
            }
        },
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(220, 230, 255, 255)]),
        strokes: Paints::new(vec![solid(150, 170, 220, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: true,
    });

    let inner = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 15.0,
            right: 0.0,
            bottom: 0.0,
            left: 15.0,
        }),
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
        fills: Paints::new(vec![solid(255, 240, 230, 255)]),
        strokes: Paints::new(vec![solid(220, 180, 150, 255)]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects::default(),
        clip: false,
    });

    // Leaf inside the innermost container
    let leaf = rect(10.0, 10.0, 80.0, 60.0, solid(128, 60, 200, 255));

    // ── Tree ────────────────────────────────────────────────────────────
    let mut links = HashMap::new();
    links.insert(1u64, vec![2u64]); // clip_on → overflow_rect
    links.insert(3u64, vec![4u64]); // clip_off → overflow_rect2
    links.insert(5u64, vec![6u64]); // outer → middle
    links.insert(6u64, vec![7u64]); // middle → inner
    links.insert(7u64, vec![8u64]); // inner → leaf

    build_scene(
        "L0 Container",
        None,
        vec![
            (1, clip_on),
            (2, overflow_rect),
            (3, clip_off),
            (4, overflow_rect2),
            (5, outer),
            (6, middle),
            (7, inner),
            (8, leaf),
        ],
        links,
        vec![1, 3, 5],
    )
}
