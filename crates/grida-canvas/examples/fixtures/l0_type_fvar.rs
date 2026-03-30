use super::*;

/// Variable font axes: weight, width, optical sizing, and custom fvar axes.
pub fn build() -> Scene {
    let y_gap = 50.0;

    // Weight axis via font_weight (100..900)
    let weights = [
        (100, "Thin 100"),
        (300, "Light 300"),
        (400, "Regular 400"),
        (700, "Bold 700"),
        (900, "Black 900"),
    ];

    let mut nodes: Vec<Node> = Vec::new();

    for (i, (w, label)) in weights.iter().enumerate() {
        nodes.push(Node::TextSpan(TextSpanNodeRec {
            active: true,
            transform: AffineTransform::new(0.0, (i as f32) * y_gap, 0.0),
            width: None,
            height: None,
            layout_child: None,
            text: label.to_string(),
            text_style: {
                let mut ts = TextStyleRec::from_font("Inter", 20.0);
                ts.font_weight = FontWeight(*w);
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
        }));
    }

    let base_y = (weights.len() as f32) * y_gap;

    // Width axis (font_width field — high-level wdth exposure)
    nodes.push(Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, base_y, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "Condensed (width=75)".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_width = Some(75.0);
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
    }));

    // Optical sizing
    nodes.push(Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, base_y + y_gap, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "Optical Size Fixed(48)".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_optical_sizing = FontOpticalSizing::Fixed(48.0);
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
    }));

    // Custom fvar axes via font_variations
    nodes.push(Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, base_y + y_gap * 2.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "Custom Axes: wght=600 wdth=80 GRAD=50".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Roboto Flex", 20.0);
            ts.font_variations = Some(vec![
                FontVariation {
                    axis: "wght".to_owned(),
                    value: 600.0,
                },
                FontVariation {
                    axis: "wdth".to_owned(),
                    value: 80.0,
                },
                FontVariation {
                    axis: "GRAD".to_owned(),
                    value: 50.0,
                },
            ]);
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
    }));

    // Italic style
    nodes.push(Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, base_y + y_gap * 3.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "Italic Style".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_style_italic = true;
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
    }));

    flat_scene("L0 Type fvar", nodes)
}
