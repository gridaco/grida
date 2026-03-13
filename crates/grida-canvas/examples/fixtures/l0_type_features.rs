use super::*;

/// OpenType font features: ligatures, small caps, stylistic sets, etc.
pub fn build() -> Scene {
    let y_gap = 50.0;

    // Ligatures disabled
    let t1 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, 0.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "ffi ffl — liga off".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_features = Some(vec![
                FontFeature { tag: "liga".to_owned(), value: false },
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
    });

    // Ligatures enabled (default, explicit)
    let t2 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "ffi ffl — liga on".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_features = Some(vec![
                FontFeature { tag: "liga".to_owned(), value: true },
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
    });

    // Small caps
    let t3 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 2.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "Small Caps Text — smcp".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_features = Some(vec![
                FontFeature { tag: "smcp".to_owned(), value: true },
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
    });

    // Stylistic set 01
    let t4 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 3.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "Stylistic Set 01 — ss01".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_features = Some(vec![
                FontFeature { tag: "ss01".to_owned(), value: true },
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
    });

    // Tabular numbers + slashed zero
    let t5 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 4.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "0123456789 — tnum + zero".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_features = Some(vec![
                FontFeature { tag: "tnum".to_owned(), value: true },
                FontFeature { tag: "zero".to_owned(), value: true },
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
    });

    // Kerning off
    let t6 = Node::TextSpan(TextSpanNodeRec {
        active: true,
        transform: AffineTransform::new(0.0, y_gap * 5.0, 0.0),
        width: None,
        height: None,
        layout_child: None,
        text: "AVAW Typography — kern off".to_owned(),
        text_style: {
            let mut ts = TextStyleRec::from_font("Inter", 20.0);
            ts.font_kerning = false;
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

    flat_scene("L0 Type Features", vec![t1, t2, t3, t4, t5, t6])
}
