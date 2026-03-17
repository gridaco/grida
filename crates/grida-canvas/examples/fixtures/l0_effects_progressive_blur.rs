use super::*;
use cg::cg::fe::*;

fn effect_rect(x: f32, effects: LayerEffects) -> Node {
    Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(x, 0.0, 200.0, 200.0, 0.0),
        size: Size { width: 200.0, height: 200.0 },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(180, 180, 180, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects,
        layout_child: None,
    })
}

pub fn build() -> Scene {
    let gap = 220.0;

    // Layer progressive blur: top-left clear → bottom-right blurred
    let layer_tl_br = effect_rect(0.0, LayerEffects {
        blur: Some(FeLayerBlur {
            active: true,
            blur: FeBlur::Progressive(FeProgressiveBlur {
                start: Alignment::TOP_LEFT,
                end: Alignment::BOTTOM_RIGHT,
                radius: 0.0,
                radius2: 20.0,
            }),
        }),
        ..LayerEffects::default()
    });

    // Layer progressive blur: top clear → bottom blurred (vertical gradient)
    let layer_top_bottom = effect_rect(gap, LayerEffects {
        blur: Some(FeLayerBlur {
            active: true,
            blur: FeBlur::Progressive(FeProgressiveBlur {
                start: Alignment::TOP_CENTER,
                end: Alignment::BOTTOM_CENTER,
                radius: 0.0,
                radius2: 30.0,
            }),
        }),
        ..LayerEffects::default()
    });

    // Layer progressive blur: both ends blurred (non-zero start radius)
    let layer_both = effect_rect(gap * 2.0, LayerEffects {
        blur: Some(FeLayerBlur {
            active: true,
            blur: FeBlur::Progressive(FeProgressiveBlur {
                start: Alignment::CENTER_LEFT,
                end: Alignment::CENTER_RIGHT,
                radius: 5.0,
                radius2: 25.0,
            }),
        }),
        ..LayerEffects::default()
    });

    // Backdrop progressive blur: center clear → edges blurred
    let backdrop = effect_rect(gap * 3.0, LayerEffects {
        backdrop_blur: Some(FeBackdropBlur {
            active: true,
            blur: FeBlur::Progressive(FeProgressiveBlur {
                start: Alignment::CENTER,
                end: Alignment::BOTTOM_RIGHT,
                radius: 0.0,
                radius2: 15.0,
            }),
        }),
        ..LayerEffects::default()
    });

    flat_scene(
        "L0 Effects Progressive Blur",
        vec![layer_tl_br, layer_top_bottom, layer_both, backdrop],
    )
}
