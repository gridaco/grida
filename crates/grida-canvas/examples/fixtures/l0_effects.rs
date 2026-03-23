use super::*;
use cg::cg::color::CGColor;
use cg::cg::fe::*;

fn effect_rect(x: f32, effects: LayerEffects) -> Node {
    Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(x, 0.0, 150.0, 150.0, 0.0),
        size: Size {
            width: 150.0,
            height: 150.0,
        },
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
    let gap = 170.0;

    let blur = effect_rect(
        0.0,
        LayerEffects {
            blur: Some(FeLayerBlur {
                active: true,
                blur: FeBlur::Gaussian(FeGaussianBlur { radius: 5.0 }),
            }),
            ..LayerEffects::default()
        },
    );

    let backdrop = effect_rect(
        gap,
        LayerEffects {
            backdrop_blur: Some(FeBackdropBlur {
                active: true,
                blur: FeBlur::Gaussian(FeGaussianBlur { radius: 8.0 }),
            }),
            ..LayerEffects::default()
        },
    );

    let drop_shadow = effect_rect(
        gap * 2.0,
        LayerEffects {
            shadows: vec![FilterShadowEffect::DropShadow(FeShadow {
                dx: 2.0,
                dy: 2.0,
                blur: 4.0,
                spread: 0.0,
                color: CGColor {
                    r: 0,
                    g: 0,
                    b: 0,
                    a: 255,
                },
                active: true,
            })],
            ..LayerEffects::default()
        },
    );

    let inner_shadow = effect_rect(
        gap * 3.0,
        LayerEffects {
            shadows: vec![FilterShadowEffect::InnerShadow(FeShadow {
                dx: 1.0,
                dy: 1.0,
                blur: 3.0,
                spread: 0.0,
                color: CGColor {
                    r: 128,
                    g: 128,
                    b: 128,
                    a: 200,
                },
                active: true,
            })],
            ..LayerEffects::default()
        },
    );

    let noise = effect_rect(
        gap * 4.0,
        LayerEffects {
            noises: vec![FeNoiseEffect {
                active: true,
                noise_size: 1.0,
                density: 0.3,
                num_octaves: 4,
                seed: 42.0,
                coloring: NoiseEffectColors::Mono {
                    color: CGColor {
                        r: 0,
                        g: 0,
                        b: 0,
                        a: 64,
                    },
                },
                blend_mode: BlendMode::Normal,
            }],
            ..LayerEffects::default()
        },
    );

    flat_scene(
        "L0 Effects",
        vec![blur, backdrop, drop_shadow, inner_shadow, noise],
    )
}
