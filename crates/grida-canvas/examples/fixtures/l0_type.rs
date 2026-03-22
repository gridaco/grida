use super::*;
use cg::cg::color::CGColor;
use cg::cg::fe::*;

fn tspan(
    x: f32, y: f32,
    content: &str,
    font_size: f32,
    font_weight: u32,
    h_align: TextAlign,
    v_align: TextAlignVertical,
    width: Option<f32>,
    height: Option<f32>,
) -> Node {
    Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(x, y, 0.0),
        width,
        height,
        layout_child: None,
        text: content.to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", font_size);
            ts.font_weight = FontWeight(font_weight);
            ts
        },
        text_align: h_align,
        text_align_vertical: v_align,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::new(vec![]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    })
}

pub fn build() -> Scene {
    let y_gap = 50.0;

    // Regular 16px, Left/Top
    let t1 = tspan(0.0, 0.0,
        "Regular 16px", 16.0, 400,
        TextAlign::Left, TextAlignVertical::Top, None, None);

    // Bold 24px, Center/Center
    let t2 = tspan(0.0, y_gap,
        "Bold 24px", 24.0, 700,
        TextAlign::Center, TextAlignVertical::Center,
        Some(300.0), Some(40.0));

    // Right aligned
    let t3 = tspan(0.0, y_gap * 2.0,
        "Right Aligned", 16.0, 400,
        TextAlign::Right, TextAlignVertical::Bottom,
        Some(300.0), Some(30.0));

    // Justified text
    let t4 = tspan(0.0, y_gap * 3.0,
        "Justified Text with enough words to wrap across multiple lines for demonstration.",
        14.0, 400,
        TextAlign::Justify, TextAlignVertical::Top,
        Some(200.0), None);

    // Text with stroke
    let t5 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 5.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "With Stroke".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_weight = FontWeight(400);
            ts
        },
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::new(vec![solid(220, 59, 59, 255)]),
        stroke_width: 1.0,
        stroke_align: StrokeAlign::Outside,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    });

    // Text with drop shadow
    let t6 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 6.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "Drop Shadow".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_weight = FontWeight(400);
            ts
        },
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::new(vec![]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects {
            shadows: vec![FilterShadowEffect::DropShadow(FeShadow {
                dx: 2.0, dy: 2.0, blur: 4.0, spread: 0.0,
                color: CGColor { r: 0, g: 0, b: 0, a: 153 },
                active: true,
            })],
            ..LayerEffects::default()
        },
    });

    // Max lines + ellipsis
    let t7 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 7.0, 0.0),
        width: Some(120.0),
        height: None,
        layout_child: None,
        text: "Max 2 Lines with truncation and ellipsis at the end".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 14.0);
            ts.font_weight = FontWeight(400);
            ts
        },
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: Some(2),
        ellipsis: Some("\u{2026}".to_owned()),
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::new(vec![]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    });

    // Letter spacing + line height
    let t8 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 8.5, 0.0),
        width: Some(300.0),
        height: None,
        layout_child: None,
        text: "Tracked + Tall Line Height".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 16.0);
            ts.letter_spacing = TextLetterSpacing::Fixed(4.0);
            ts.line_height = TextLineHeight::Factor(2.0);
            ts
        },
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::new(vec![]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    });

    // Underline decoration (red, 2px thick)
    let t9 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 10.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "Underlined Text".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 18.0);
            ts.text_decoration = Some(TextDecorationRec {
                text_decoration_line: TextDecorationLine::Underline,
                text_decoration_color: Some(CGColor { r: 220, g: 59, b: 59, a: 255 }),
                text_decoration_style: Some(TextDecorationStyle::Solid),
                text_decoration_skip_ink: Some(true),
                text_decoration_thickness: Some(2.0),
            });
            ts
        },
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::new(vec![]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    });

    // UPPERCASE transform
    let t10 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 11.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "uppercase transform".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 16.0);
            ts.text_transform = TextTransform::Uppercase;
            ts
        },
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::new(vec![]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    });

    flat_scene("L0 Type", vec![t1, t2, t3, t4, t5, t6, t7, t8, t9, t10])
}
