use super::*;
use cg::cg::color::CGColor;

fn attr_node(
    x: f32,
    y: f32,
    width: Option<f32>,
    attr: AttributedString,
    default_style: TextStyleRec,
) -> Node {
    Node::AttributedText(AttributedTextNodeRec {
        active: true,
        transform: AffineTransform::new(x, y, 0.0),
        width,
        height: None,
        layout_child: None,
        attributed_string: attr,
        default_style,
        text_align: TextAlign::Left,
        text_align_vertical: TextAlignVertical::Top,
        max_lines: None,
        ellipsis: None,
        fills: Paints::new(vec![solid(0, 0, 0, 255)]),
        strokes: Paints::default(),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        effects: LayerEffects::default(),
    })
}

pub fn build() -> Scene {
    let base = TextStyleRec::from_font("Inter", 18.0);
    let mut bold = TextStyleRec::from_font("Inter", 18.0);
    bold.font_weight = FontWeight(700);
    let small = TextStyleRec::from_font("Inter", 13.0);

    // t1: Mixed weights
    let t1 = attr_node(
        20.0,
        20.0,
        None,
        AttributedStringBuilder::new()
            .push("Bold ", &bold, Some(CGColor::BLACK))
            .push("Regular ", &base, Some(CGColor::BLACK))
            .push("text in one line.", &base, Some(CGColor::BLACK))
            .build(),
        base.clone(),
    );

    // t2: Mixed colors
    let t2 = attr_node(
        20.0,
        60.0,
        None,
        AttributedStringBuilder::new()
            .push("Red ", &base, Some(CGColor::RED))
            .push("Green ", &base, Some(CGColor::GREEN))
            .push("Blue", &base, Some(CGColor::BLUE))
            .build(),
        base.clone(),
    );

    // t3: Mixed sizes
    let t3 = attr_node(
        20.0,
        100.0,
        None,
        AttributedStringBuilder::new()
            .push("Small ", &small, Some(CGColor::BLACK))
            .push("Normal ", &base, Some(CGColor::BLACK))
            .push(
                "Bold Large",
                &{
                    let mut s = TextStyleRec::from_font("Inter", 28.0);
                    s.font_weight = FontWeight(700);
                    s
                },
                Some(CGColor::BLACK),
            )
            .build(),
        base.clone(),
    );

    // t4: Multi-line wrapping with attributed runs
    let t4 = attr_node(
        20.0,
        160.0,
        Some(300.0),
        AttributedStringBuilder::new()
            .push("This paragraph demonstrates ", &base, Some(CGColor::BLACK))
            .push(
                "bold runs that wrap across line boundaries",
                &bold,
                Some(CGColor::from_rgba(0, 100, 200, 255)),
            )
            .push(
                " and then continues with regular text.",
                &base,
                Some(CGColor::BLACK),
            )
            .build(),
        base.clone(),
    );

    // t5: Faux bullet list (using indent + bullet symbol)
    let bullet_color = CGColor::from_rgba(100, 100, 100, 255);
    let t5 = attr_node(
        20.0,
        280.0,
        Some(400.0),
        AttributedStringBuilder::new()
            .push("\u{2022} ", &base, Some(bullet_color))
            .push("First item with ", &base, Some(CGColor::BLACK))
            .push("bold emphasis\n", &bold, Some(CGColor::BLACK))
            .push("\u{2022} ", &base, Some(bullet_color))
            .push("Second item plain\n", &base, Some(CGColor::BLACK))
            .push("\u{2022} ", &base, Some(bullet_color))
            .push("Third with ", &base, Some(CGColor::BLACK))
            .push("color", &base, Some(CGColor::from_rgba(0, 120, 200, 255)))
            .build(),
        base.clone(),
    );

    // t6: Decoration mix (underline + strikethrough)
    let mut underline = base.clone();
    underline.text_decoration = Some(TextDecorationRec {
        text_decoration_line: TextDecorationLine::Underline,
        text_decoration_color: Some(CGColor::RED),
        text_decoration_style: None,
        text_decoration_skip_ink: None,
        text_decoration_thickness: None,
    });
    let mut strikethrough = base.clone();
    strikethrough.text_decoration = Some(TextDecorationRec {
        text_decoration_line: TextDecorationLine::LineThrough,
        text_decoration_color: Some(CGColor::from_rgba(100, 100, 100, 255)),
        text_decoration_style: None,
        text_decoration_skip_ink: None,
        text_decoration_thickness: None,
    });
    let t6 = attr_node(
        20.0,
        400.0,
        None,
        AttributedStringBuilder::new()
            .push("Plain, ", &base, Some(CGColor::BLACK))
            .push("underlined", &underline, Some(CGColor::BLACK))
            .push(", ", &base, Some(CGColor::BLACK))
            .push("strikethrough", &strikethrough, Some(CGColor::BLACK))
            .push(", plain.", &base, Some(CGColor::BLACK))
            .build(),
        base.clone(),
    );

    flat_scene("L0 Type Attributed", vec![t1, t2, t3, t4, t5, t6])
}
