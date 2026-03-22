//! Cover image scene builder.
//!
//! Builds a visually rich 1600×900 composition that showcases the cg engine's
//! capabilities: multi-stop gradients, corner smoothing, blend modes, drop and
//! inner shadows, noise grain, sweep gradients, and typography — composed into
//! something that looks like a premium design-tool hero image.

use super::*;
use cg::cg::color::CGColor;
use cg::cg::fe::*;
use cg::cg::stroke_width::SingularStrokeWidth;

// ═══════════════════════════════════════════════════════════════════════════
// Palette
// ═══════════════════════════════════════════════════════════════════════════

const BG: CGColor = CGColor { r: 14, g: 14, b: 18, a: 255 };

// Deep purples / blues / ambers
const PURPLE_DEEP: CGColor = CGColor { r: 88, g: 28, b: 180, a: 255 };
const PURPLE_LIGHT: CGColor = CGColor { r: 168, g: 85, b: 247, a: 255 };
const BLUE_ELECTRIC: CGColor = CGColor { r: 56, g: 130, b: 255, a: 255 };
const BLUE_DEEP: CGColor = CGColor { r: 30, g: 64, b: 175, a: 255 };
const CYAN_GLOW: CGColor = CGColor { r: 34, g: 211, b: 238, a: 255 };
const AMBER: CGColor = CGColor { r: 245, g: 158, b: 11, a: 255 };
const AMBER_WARM: CGColor = CGColor { r: 251, g: 191, b: 36, a: 255 };
const ROSE: CGColor = CGColor { r: 244, g: 63, b: 94, a: 255 };
const WHITE_DIM: CGColor = CGColor { r: 255, g: 255, b: 255, a: 18 };
const WHITE_FAINT: CGColor = CGColor { r: 255, g: 255, b: 255, a: 8 };

// ═══════════════════════════════════════════════════════════════════════════
// Scene
// ═══════════════════════════════════════════════════════════════════════════

pub const WIDTH: f32 = 1600.0;
pub const HEIGHT: f32 = 900.0;

pub fn build() -> Scene {
    let mut nodes: Vec<(NodeId, Node)> = Vec::new();
    let links: std::collections::HashMap<NodeId, Vec<NodeId>> = std::collections::HashMap::new();
    let mut id = 0u64;
    let mut next_id = || { id += 1; id };

    // ── 1. Background fill ──────────────────────────────────────────────
    let bg_id = next_id();
    nodes.push((bg_id, rect(0.0, 0.0, WIDTH, HEIGHT, Paint::Solid(SolidPaint {
        active: true,
        color: BG,
        blend_mode: BlendMode::Normal,
    }))));

    // ── 2. Large ambient glow — radial gradient, bottom-left ────────────
    let glow1_id = next_id();
    nodes.push((glow1_id, Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 0.55,
        blend_mode: LayerBlendMode::Blend(BlendMode::Screen),
        mask: None,
        transform: AffineTransform::from_box_center(-200.0, 300.0, 1100.0, 1100.0, 0.0),
        size: Size { width: 1100.0, height: 1100.0 },
        fills: Paints::new(vec![Paint::RadialGradient(RadialGradientPaint {
            active: true,
            transform: AffineTransform::default(),
            stops: vec![
                GradientStop { offset: 0.0, color: PURPLE_DEEP },
                GradientStop { offset: 0.5, color: CGColor { r: 88, g: 28, b: 180, a: 120 } },
                GradientStop { offset: 1.0, color: CGColor { r: 88, g: 28, b: 180, a: 0 } },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            tile_mode: TileMode::default(),
        })]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        inner_radius: None,
        start_angle: 0.0,
        angle: None,
        corner_radius: None,
        effects: LayerEffects::default(),
        layout_child: None,
    })));

    // ── 3. Ambient glow — top-right, blue ───────────────────────────────
    let glow2_id = next_id();
    nodes.push((glow2_id, Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 0.40,
        blend_mode: LayerBlendMode::Blend(BlendMode::Screen),
        mask: None,
        transform: AffineTransform::from_box_center(900.0, -300.0, 1000.0, 1000.0, 0.0),
        size: Size { width: 1000.0, height: 1000.0 },
        fills: Paints::new(vec![Paint::RadialGradient(RadialGradientPaint {
            active: true,
            transform: AffineTransform::default(),
            stops: vec![
                GradientStop { offset: 0.0, color: BLUE_ELECTRIC },
                GradientStop { offset: 0.55, color: CGColor { r: 56, g: 130, b: 255, a: 80 } },
                GradientStop { offset: 1.0, color: CGColor { r: 56, g: 130, b: 255, a: 0 } },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            tile_mode: TileMode::default(),
        })]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        inner_radius: None,
        start_angle: 0.0,
        angle: None,
        corner_radius: None,
        effects: LayerEffects::default(),
        layout_child: None,
    })));

    // ── 4. Hero rounded rectangle — purple→blue linear gradient ─────────
    //    with corner smoothing (G2), drop shadow, inner shadow
    let hero_id = next_id();
    nodes.push((hero_id, Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(180.0, 160.0, 520.0, 580.0, 0.0),
        size: Size { width: 520.0, height: 580.0 },
        corner_radius: RectangularCornerRadius::circular(48.0),
        corner_smoothing: CornerSmoothing(0.6),
        fills: Paints::new(vec![
            Paint::LinearGradient(LinearGradientPaint {
                active: true,
                xy1: Alignment(-1.0, -1.0),   // top-left
                xy2: Alignment(1.0, 1.0),      // bottom-right
                tile_mode: TileMode::default(),
                transform: AffineTransform::default(),
                stops: vec![
                    GradientStop { offset: 0.0, color: PURPLE_DEEP },
                    GradientStop { offset: 0.45, color: BLUE_DEEP },
                    GradientStop { offset: 1.0, color: BLUE_ELECTRIC },
                ],
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
            }),
        ]),
        strokes: Paints::new(vec![Paint::Solid(SolidPaint {
            active: true,
            color: CGColor { r: 255, g: 255, b: 255, a: 15 },
            blend_mode: BlendMode::Normal,
        })]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects {
            shadows: vec![
                FilterShadowEffect::DropShadow(FeShadow {
                    dx: 0.0, dy: 24.0, blur: 80.0, spread: -8.0,
                    color: CGColor { r: 0, g: 0, b: 0, a: 160 },
                    active: true,
                }),
                FilterShadowEffect::InnerShadow(FeShadow {
                    dx: 0.0, dy: 2.0, blur: 40.0, spread: 0.0,
                    color: CGColor { r: 255, g: 255, b: 255, a: 30 },
                    active: true,
                }),
            ],
            ..LayerEffects::default()
        },
        layout_child: None,
    })));

    // ── 5. Second card — overlapping, amber→rose gradient, rotated ──────
    let card2_id = next_id();
    nodes.push((card2_id, Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 0.90,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(520.0, 240.0, 440.0, 520.0, -6.0),
        size: Size { width: 440.0, height: 520.0 },
        corner_radius: RectangularCornerRadius::circular(40.0),
        corner_smoothing: CornerSmoothing(0.6),
        fills: Paints::new(vec![
            Paint::LinearGradient(LinearGradientPaint {
                active: true,
                xy1: Alignment(0.0, -1.0),   // top-center
                xy2: Alignment(0.0, 1.0),     // bottom-center
                tile_mode: TileMode::default(),
                transform: AffineTransform::default(),
                stops: vec![
                    GradientStop { offset: 0.0, color: AMBER },
                    GradientStop { offset: 0.6, color: ROSE },
                    GradientStop { offset: 1.0, color: PURPLE_DEEP },
                ],
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
            }),
        ]),
        strokes: Paints::new(vec![Paint::Solid(SolidPaint {
            active: true,
            color: CGColor { r: 255, g: 255, b: 255, a: 12 },
            blend_mode: BlendMode::Normal,
        })]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects {
            shadows: vec![
                FilterShadowEffect::DropShadow(FeShadow {
                    dx: 0.0, dy: 16.0, blur: 64.0, spread: -4.0,
                    color: CGColor { r: 0, g: 0, b: 0, a: 140 },
                    active: true,
                }),
                FilterShadowEffect::InnerShadow(FeShadow {
                    dx: 0.0, dy: 1.0, blur: 24.0, spread: 0.0,
                    color: CGColor { r: 255, g: 255, b: 255, a: 25 },
                    active: true,
                }),
            ],
            ..LayerEffects::default()
        },
        layout_child: None,
    })));

    // ── 6. Third card — smaller, cyan→blue, further right ───────────────
    let card3_id = next_id();
    nodes.push((card3_id, Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 0.85,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(880.0, 120.0, 380.0, 460.0, 4.0),
        size: Size { width: 380.0, height: 460.0 },
        corner_radius: RectangularCornerRadius::circular(36.0),
        corner_smoothing: CornerSmoothing(0.6),
        fills: Paints::new(vec![
            Paint::LinearGradient(LinearGradientPaint {
                active: true,
                xy1: Alignment(-1.0, 0.0),
                xy2: Alignment(1.0, 0.0),
                tile_mode: TileMode::default(),
                transform: AffineTransform::default(),
                stops: vec![
                    GradientStop { offset: 0.0, color: CYAN_GLOW },
                    GradientStop { offset: 0.5, color: BLUE_ELECTRIC },
                    GradientStop { offset: 1.0, color: BLUE_DEEP },
                ],
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
            }),
        ]),
        strokes: Paints::new(vec![Paint::Solid(SolidPaint {
            active: true,
            color: CGColor { r: 255, g: 255, b: 255, a: 10 },
            blend_mode: BlendMode::Normal,
        })]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::Uniform(1.0),
        effects: LayerEffects {
            shadows: vec![
                FilterShadowEffect::DropShadow(FeShadow {
                    dx: 0.0, dy: 20.0, blur: 60.0, spread: -6.0,
                    color: CGColor { r: 0, g: 0, b: 0, a: 150 },
                    active: true,
                }),
            ],
            ..LayerEffects::default()
        },
        layout_child: None,
    })));

    // ── 7. Sweep gradient circle — accent, top-right area ───────────────
    let sweep_id = next_id();
    nodes.push((sweep_id, Node::Ellipse(EllipseNodeRec {
        active: true,
        opacity: 0.75,
        blend_mode: LayerBlendMode::Blend(BlendMode::Screen),
        mask: None,
        transform: AffineTransform::from_box_center(1100.0, 80.0, 340.0, 340.0, 0.0),
        size: Size { width: 340.0, height: 340.0 },
        fills: Paints::new(vec![Paint::SweepGradient(SweepGradientPaint {
            active: true,
            transform: AffineTransform::default(),
            stops: vec![
                GradientStop { offset: 0.0, color: AMBER_WARM },
                GradientStop { offset: 0.25, color: ROSE },
                GradientStop { offset: 0.5, color: PURPLE_LIGHT },
                GradientStop { offset: 0.75, color: BLUE_ELECTRIC },
                GradientStop { offset: 1.0, color: AMBER_WARM },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
        })]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        inner_radius: None,
        start_angle: 0.0,
        angle: None,
        corner_radius: None,
        effects: LayerEffects {
            shadows: vec![
                FilterShadowEffect::DropShadow(FeShadow {
                    dx: 0.0, dy: 8.0, blur: 48.0, spread: 0.0,
                    color: CGColor { r: 245, g: 158, b: 11, a: 100 },
                    active: true,
                }),
            ],
            ..LayerEffects::default()
        },
        layout_child: None,
    })));

    // ── 8. Small floating hexagon — bottom-right ────────────────────────
    let hex_id = next_id();
    nodes.push((hex_id, Node::RegularPolygon(RegularPolygonNodeRec {
        active: true,
        opacity: 0.5,
        blend_mode: LayerBlendMode::Blend(BlendMode::Screen),
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(1300.0, 560.0, 180.0, 180.0, 15.0),
        size: Size { width: 180.0, height: 180.0 },
        point_count: 6,
        corner_radius: 12.0,
        fills: Paints::new(vec![Paint::LinearGradient(LinearGradientPaint {
            active: true,
            xy1: Alignment(-1.0, -1.0),
            xy2: Alignment(1.0, 1.0),
            tile_mode: TileMode::default(),
            transform: AffineTransform::default(),
            stops: vec![
                GradientStop { offset: 0.0, color: PURPLE_LIGHT },
                GradientStop { offset: 1.0, color: BLUE_ELECTRIC },
            ],
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
        })]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    })));

    // ── 9. 4-point star — small accent, left side ───────────────────────
    let star_id = next_id();
    nodes.push((star_id, Node::RegularStarPolygon(RegularStarPolygonNodeRec {
        active: true,
        opacity: 0.35,
        blend_mode: LayerBlendMode::Blend(BlendMode::Screen),
        mask: None,
        effects: LayerEffects::default(),
        transform: AffineTransform::from_box_center(80.0, 680.0, 120.0, 120.0, 22.0),
        size: Size { width: 120.0, height: 120.0 },
        point_count: 4,
        inner_radius: 0.35,
        corner_radius: 4.0,
        fills: Paints::new(vec![Paint::Solid(SolidPaint {
            active: true,
            color: AMBER_WARM,
            blend_mode: BlendMode::Normal,
        })]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: SingularStrokeWidth(None),
        layout_child: None,
    })));

    // ── 10. Thin decorative lines — horizontal rule accents ─────────────
    let line1_id = next_id();
    nodes.push((line1_id, rect(120.0, 800.0, 400.0, 1.0, Paint::Solid(SolidPaint {
        active: true,
        color: WHITE_DIM,
        blend_mode: BlendMode::Normal,
    }))));

    let line2_id = next_id();
    nodes.push((line2_id, rect(1080.0, 800.0, 400.0, 1.0, Paint::Solid(SolidPaint {
        active: true,
        color: WHITE_FAINT,
        blend_mode: BlendMode::Normal,
    }))));

    // ── 11. "cg" typography — large, with gradient fill ─────────────────
    let text_id = next_id();
    nodes.push((text_id, Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(120.0, 790.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "cg".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Geist", 72.0);
            ts.font_weight = FontWeight(800);
            ts.letter_spacing = TextLetterSpacing::Fixed(-2.0);
            ts
        },
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![
            Paint::LinearGradient(LinearGradientPaint {
                active: true,
                xy1: Alignment(-1.0, 0.0),
                xy2: Alignment(1.0, 0.0),
                tile_mode: TileMode::default(),
                transform: AffineTransform::default(),
                stops: vec![
                    GradientStop { offset: 0.0, color: CGColor { r: 255, g: 255, b: 255, a: 180 } },
                    GradientStop { offset: 1.0, color: CGColor { r: 255, g: 255, b: 255, a: 60 } },
                ],
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
            }),
        ]),
        strokes: Paints::new(vec![]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    })));

    // ── 12. Subtitle text ───────────────────────────────────────────────
    let sub_id = next_id();
    nodes.push((sub_id, Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(240.0, 815.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "grida canvas".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Geist", 20.0);
            ts.font_weight = FontWeight(400);
            ts.letter_spacing = TextLetterSpacing::Fixed(6.0);
            ts.text_transform = TextTransform::Uppercase;
            ts
        },
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![Paint::Solid(SolidPaint {
            active: true,
            color: CGColor { r: 255, g: 255, b: 255, a: 80 },
            blend_mode: BlendMode::Normal,
        })]),
        strokes: Paints::new(vec![]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    })));

    // ── 13. Floating small circles (decorative particles) ───────────────
    let particle_positions: &[(f32, f32, f32, f32)] = &[
        // (x, y, size, opacity)
        (350.0, 100.0, 8.0, 0.4),
        (750.0, 50.0, 6.0, 0.3),
        (1050.0, 500.0, 10.0, 0.25),
        (200.0, 500.0, 5.0, 0.35),
        (1400.0, 200.0, 7.0, 0.3),
        (600.0, 700.0, 9.0, 0.2),
        (1350.0, 750.0, 6.0, 0.25),
    ];

    for &(px, py, ps, po) in particle_positions {
        let pid = next_id();
        nodes.push((pid, Node::Ellipse(EllipseNodeRec {
            active: true,
            opacity: po,
            blend_mode: LayerBlendMode::Blend(BlendMode::Screen),
            mask: None,
            transform: AffineTransform::from_box_center(px, py, ps, ps, 0.0),
            size: Size { width: ps, height: ps },
            fills: Paints::new(vec![Paint::Solid(SolidPaint {
                active: true,
                color: CGColor { r: 255, g: 255, b: 255, a: 255 },
                blend_mode: BlendMode::Normal,
            })]),
            strokes: Paints::new(vec![]),
            stroke_style: StrokeStyle::default(),
            stroke_width: SingularStrokeWidth(None),
            inner_radius: None,
            start_angle: 0.0,
            angle: None,
            corner_radius: None,
            effects: LayerEffects::default(),
            layout_child: None,
        })));
    }

    // ── 14. Full-canvas noise grain overlay ──────────────────────────────
    let noise_id = next_id();
    nodes.push((noise_id, Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(0.0, 0.0, WIDTH, HEIGHT, 0.0),
        size: Size { width: WIDTH, height: HEIGHT },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![]),   // transparent — only noise
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects {
            noises: vec![FeNoiseEffect {
                active: true,
                noise_size: 1.5,
                density: 0.35,
                num_octaves: 3,
                seed: 7.0,
                coloring: NoiseEffectColors::Mono {
                    color: CGColor { r: 255, g: 255, b: 255, a: 18 },
                },
                blend_mode: BlendMode::Normal,
            }],
            ..LayerEffects::default()
        },
        layout_child: None,
    })));

    // ── Assemble ────────────────────────────────────────────────────────
    let roots: Vec<u64> = nodes.iter().map(|(nid, _)| *nid).collect();
    build_scene("Cover", Some(BG), nodes, links, roots)
}
