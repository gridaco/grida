use super::*;
use cg::cg::alignment::Alignment;
use cg::cg::color::CGColor;
use cg::cg::tilemode::TileMode;
use math2::box_fit::BoxFit;
use math2::transform::AffineTransform;

pub fn build() -> Scene {
    // Single rectangle with 5 stacked fills
    let stacked = Node::Rectangle(RectangleNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: AffineTransform::from_box_center(0.0, 0.0, 200.0, 200.0, 0.0),
        size: Size { width: 200.0, height: 200.0 },
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![
            // [0] solid white base
            solid(255, 255, 255, 255),
            // [1] linear gradient red→transparent
            Paint::LinearGradient(LinearGradientPaint {
                active: true,
                xy1: Alignment::CENTER_LEFT,
                xy2: Alignment::CENTER_RIGHT,
                tile_mode: TileMode::default(),
                transform: AffineTransform::default(),
                stops: vec![
                    GradientStop { offset: 0.0, color: CGColor { r: 255, g: 0, b: 0, a: 255 } },
                    GradientStop { offset: 1.0, color: CGColor { r: 255, g: 0, b: 0, a: 0 } },
                ],
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
            }),
            // [2] radial gradient yellow center→transparent
            Paint::RadialGradient(RadialGradientPaint {
                active: true,
                transform: AffineTransform::default(),
                stops: vec![
                    GradientStop { offset: 0.0, color: CGColor { r: 255, g: 255, b: 0, a: 255 } },
                    GradientStop { offset: 1.0, color: CGColor { r: 255, g: 255, b: 0, a: 0 } },
                ],
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
                tile_mode: TileMode::default(),
            }),
            // [3] sweep gradient
            sweep_gradient(),
            // [4] image paint at 50% opacity
            Paint::Image(ImagePaint {
                active: true,
                image: ResourceRef::HASH(SYSTEM_IMAGE.to_owned()),
                fit: ImagePaintFit::Fit(BoxFit::Cover),
                filters: ImageFilters::default(),
                opacity: 0.5,
                blend_mode: BlendMode::Normal,
                quarter_turns: 0,
                alignement: Alignment::CENTER,
            }),
        ]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects::default(),
        layout_child: None,
    });

    flat_scene("L0 Paints Stack", vec![stacked])
}
