use cg::cg::prelude::*;
use cg::painter::effects_noise;
use cg::painter::geometry::PainterShape;
use skia_safe::{self as sk, Color, Paint, Rect};

mod dev_kit;

fn main() {
    let (width, height) = (400, 400);
    let rect = Rect::from_xywh(0.0, 0.0, width as f32, height as f32);
    let shape = PainterShape::from_rect(rect);

    let effects = vec![
        (
            FeNoiseEffect {
                noise_size: 4.0,
                density: 0.5,
                num_octaves: 3,
                seed: 8539.0,
                coloring: NoiseEffectColors::Mono {
                    color: CGColor::from_rgba(0, 0, 0, 64), // 25% opacity black
                },
                active: true,
                blend_mode: BlendMode::Normal,
            },
            "mono",
        ),
        (
            FeNoiseEffect {
                noise_size: 4.0,
                density: 0.5,
                num_octaves: 3,
                seed: 8539.0,
                coloring: NoiseEffectColors::Duo {
                    color1: CGColor::from_rgba(255, 0, 4, 255), // red pattern
                    color2: CGColor::from_rgba(0, 0, 255, 255), // blue pattern
                },
                active: true,
                blend_mode: BlendMode::Normal,
            },
            "duo",
        ),
        (
            FeNoiseEffect {
                noise_size: 4.0,
                density: 0.5,
                num_octaves: 3,
                seed: 8539.0,
                coloring: NoiseEffectColors::Multi { opacity: 1.0 },
                active: true,
                blend_mode: BlendMode::Normal,
            },
            "multi",
        ),
    ];

    for (effect, name) in effects.iter() {
        let mut surface = dev_kit::raster_surface(width, height, Color::WHITE);
        {
            let canvas = surface.canvas();

            // light bg
            let mut bg = Paint::default();
            bg.set_color(Color::from_argb(255, 240, 240, 240));
            canvas.draw_rect(rect, &bg);

            // render effect
            effects_noise::render_noise_effect(effect, canvas, &shape);

            // label
            let label = match &effect.coloring {
                NoiseEffectColors::Mono { .. } => "Mono",
                NoiseEffectColors::Duo { .. } => "Duo",
                NoiseEffectColors::Multi { .. } => "Multi",
            };
            let mut tp = Paint::default();
            tp.set_color(Color::BLACK);
            tp.set_anti_alias(true);
            let font = sk::Font::default();
            canvas.draw_str(label, (170.0, 390.0), &font, &tp);
        }

        // save PNG
        let golden_name = format!("fe_noise_{}", name);
        dev_kit::save_golden(&mut surface, &golden_name);
        println!("✓ Saved PNG: goldens/fe_noise_{}.png", name);
    }
}
