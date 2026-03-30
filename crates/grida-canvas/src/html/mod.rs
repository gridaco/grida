//! HTML → Grida IR conversion.
//!
//! Parses HTML, resolves all CSS styles via Stylo (through [`csscascade`]),
//! and converts the styled DOM tree into a Grida [`SceneGraph`].
//!
//! This is the HTML counterpart to the SVG import pipeline in [`crate::svg`].

use crate::cg::prelude::*;
use crate::node::factory::NodeFactory;
use crate::node::scene_graph::{Parent, SceneGraph};
use crate::node::schema::*;

use csscascade::adapter::{self, HtmlElement};
use csscascade::cascade::CascadeDriver;
use csscascade::dom::{DemoDom, DemoNodeData};

use style::color::{AbsoluteColor, ColorSpace};
use style::dom::TElement;
use style::properties::longhands;
use style::properties::ComputedValues;
use style::thread_state::{self, ThreadState};
use style::values::generics::font::LineHeight;
use style::values::generics::length::{GenericMaxSize, GenericSize, LengthPercentageOrNormal};
use style::values::specified::align::AlignFlags;
use style::values::specified::border::BorderStyle;
use style::values::specified::position::{HorizontalPositionKeyword, VerticalPositionKeyword};
use style::values::specified::text::TextDecorationLine as StyloTextDecorationLine;

/// Parse an HTML string and convert it into a Grida [`SceneGraph`].
///
/// This is the main entry point, analogous to [`crate::svg::pack::from_svg_str`].
pub fn from_html_str(html: &str) -> Result<SceneGraph, String> {
    // Ensure Stylo thread state is initialized (idempotent after first call).
    let _ = thread_state::initialize(ThreadState::LAYOUT);

    // 1. Parse HTML into arena DOM
    let dom = DemoDom::parse_from_bytes(html.as_bytes())
        .map_err(|e| format!("HTML parse error: {e}"))?;

    // 2. Build cascade driver (collects <style> blocks, builds UA + author sheets)
    let mut driver = CascadeDriver::new(&dom);

    // 3. Install DOM into global slot
    let document = adapter::bootstrap_dom(dom);

    // 4. Flush stylist + resolve all styles
    driver.flush(document);
    let styled_count = driver.style_document(document);
    eprintln!("[html] resolved {} elements", styled_count);

    // 5. Build scene graph from styled DOM
    let mut builder = SceneBuilder::new();
    if let Some(root) = document.root_element() {
        builder.build_element(root, Parent::Root);
    }

    Ok(builder.graph)
}

// ---------------------------------------------------------------------------
// Scene builder — walks styled DOM, emits IR nodes
// ---------------------------------------------------------------------------

struct SceneBuilder {
    factory: NodeFactory,
    graph: SceneGraph,
}

impl SceneBuilder {
    fn new() -> Self {
        Self {
            factory: NodeFactory::new(),
            graph: SceneGraph::new(),
        }
    }

    fn build_element(&mut self, element: HtmlElement, parent: Parent) {
        let dom = adapter::dom();
        let data = element.borrow_data();
        let Some(data) = &data else {
            return;
        };

        let style = data.styles.primary();

        // Skip display:none elements entirely
        let display = style.clone_display();
        if display.is_none() {
            return;
        }

        let tag = element.local_name_string();

        // Decide what IR node type to emit
        let has_element_children = element.first_element_child().is_some();
        let has_text_children = {
            let node = dom.node(element.node_id());
            node.children.iter().any(|cid| {
                matches!(&dom.node(*cid).data, DemoNodeData::Text(t) if !t.trim().is_empty())
            })
        };

        let is_structural = matches!(tag.as_str(), "html" | "body");

        if has_element_children || has_text_children || is_structural {
            // Every element with children (element or text) becomes a Container.
            // This preserves box-model properties (border, background, dimensions)
            // that would be lost if text-only elements were flattened to TextSpan.
            let container_id = self.emit_container(style, &display, parent);
            let container_parent = Parent::NodeId(container_id);

            // Emit inline text children
            let node = dom.node(element.node_id());
            for child_id in &node.children {
                let child_node = dom.node(*child_id);
                if let DemoNodeData::Text(text) = &child_node.data {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        self.emit_text_span(trimmed, style, container_parent.clone());
                    }
                }
            }

            // Recurse into child elements
            let mut child = element.first_element_child();
            while let Some(c) = child {
                self.build_element(c, container_parent.clone());
                child = c.next_element_sibling();
            }
        } else {
            // Empty visual element → Rectangle
            self.emit_rectangle(style, parent);
        }
    }

    fn emit_container(
        &mut self,
        style: &ComputedValues,
        display: &style::values::computed::Display,
        parent: Parent,
    ) -> NodeId {
        use longhands::flex_direction::computed_value::T as FlexDir;
        use longhands::flex_wrap::computed_value::T as FlexWr;

        let is_flex = display.inside() == style::values::specified::box_::DisplayInside::Flex;
        let mut node = self.factory.create_container_node();

        // Display / layout mode
        if is_flex {
            node.layout_container.layout_mode = LayoutMode::Flex;

            node.layout_container.layout_direction = match style.clone_flex_direction() {
                FlexDir::Row | FlexDir::RowReverse => Axis::Horizontal,
                FlexDir::Column | FlexDir::ColumnReverse => Axis::Vertical,
            };

            node.layout_container.layout_wrap = Some(match style.clone_flex_wrap() {
                FlexWr::Nowrap => LayoutWrap::NoWrap,
                FlexWr::Wrap | FlexWr::WrapReverse => LayoutWrap::Wrap,
            });

            // align-items → cross axis alignment
            let align_items = style.clone_align_items();
            let ai_flags = align_items.0.value();
            node.layout_container.layout_cross_axis_alignment = match ai_flags {
                f if f == AlignFlags::CENTER => Some(CrossAxisAlignment::Center),
                f if f == AlignFlags::FLEX_START || f == AlignFlags::START => {
                    Some(CrossAxisAlignment::Start)
                }
                f if f == AlignFlags::FLEX_END || f == AlignFlags::END => {
                    Some(CrossAxisAlignment::End)
                }
                f if f == AlignFlags::STRETCH => Some(CrossAxisAlignment::Stretch),
                _ => None,
            };

            // justify-content → main axis alignment
            let jc = style.clone_justify_content();
            let jc_flags = jc.primary().value();
            node.layout_container.layout_main_axis_alignment = match jc_flags {
                f if f == AlignFlags::CENTER => Some(MainAxisAlignment::Center),
                f if f == AlignFlags::FLEX_START || f == AlignFlags::START => {
                    Some(MainAxisAlignment::Start)
                }
                f if f == AlignFlags::FLEX_END || f == AlignFlags::END => {
                    Some(MainAxisAlignment::End)
                }
                f if f == AlignFlags::SPACE_BETWEEN => Some(MainAxisAlignment::SpaceBetween),
                f if f == AlignFlags::SPACE_AROUND => Some(MainAxisAlignment::SpaceAround),
                f if f == AlignFlags::SPACE_EVENLY => Some(MainAxisAlignment::SpaceEvenly),
                f if f == AlignFlags::STRETCH => Some(MainAxisAlignment::Stretch),
                _ => None,
            };
        } else {
            // CSS `display: block` → map to Flex column.
            // The IR's `LayoutMode::Normal` maps to taffy `Display::Block`, which
            // causes children of a flex parent to stretch to 100% width (block
            // intrinsic sizing). Using Flex column instead gives correct sizing
            // when these containers are nested inside flex parents.
            node.layout_container.layout_mode = LayoutMode::Flex;
            node.layout_container.layout_direction = Axis::Vertical;
        }

        // Opacity
        node.opacity = style.get_effects().opacity;

        // Background → fills (solid color + gradients)
        node.fills = css_background_to_fills(style);

        // Border radius
        node.corner_radius = css_border_radius_to_cg(style);

        // Padding
        let padding = css_padding_to_cg(style);
        if padding.top != 0.0
            || padding.right != 0.0
            || padding.bottom != 0.0
            || padding.left != 0.0
        {
            node.layout_container.layout_padding = Some(EdgeInsets {
                top: padding.top,
                right: padding.right,
                bottom: padding.bottom,
                left: padding.left,
            });
        }

        // Gap (for flex containers)
        if is_flex {
            let pos = style.get_position();
            let rg = gap_to_px(&pos.row_gap);
            let cg = gap_to_px(&pos.column_gap);
            if rg != 0.0 || cg != 0.0 {
                node.layout_container.layout_gap = Some(LayoutGap {
                    main_axis_gap: cg,
                    cross_axis_gap: rg,
                });
            }
        }

        // Overflow → clip
        let bx = style.get_box();
        node.clip = bx.overflow_x != style::values::specified::box_::Overflow::Visible
            || bx.overflow_y != style::values::specified::box_::Overflow::Visible;

        // Borders → strokes + stroke_width
        let (border_strokes, border_stroke_width, border_stroke_style) =
            css_border_to_cg(style);
        node.strokes = border_strokes;
        node.stroke_width = border_stroke_width;
        node.stroke_style = border_stroke_style;

        // Box shadow → effects
        node.effects = css_box_shadow_to_cg(style);

        // Width / height / min / max dimensions
        css_dimensions_to_cg(style, &mut node.layout_dimensions);

        // HTML containers auto-size from content; clear the factory's 100x100 default
        // only when no explicit width/height was set.
        if node.layout_dimensions.layout_target_width.is_none() {
            node.layout_dimensions.layout_target_width = None;
        }
        if node.layout_dimensions.layout_target_height.is_none() {
            node.layout_dimensions.layout_target_height = None;
        }

        self.graph.append_child(Node::Container(node), parent)
    }

    fn emit_text_span(&mut self, text: &str, style: &ComputedValues, parent: Parent) {
        let mut node = self.factory.create_text_span_node();
        node.text = text.to_string();

        // Font properties
        let font = style.get_font();
        let font_size = font.font_size.computed_size().px();
        node.text_style.font_size = font_size;

        // font-weight
        node.text_style.font_weight = FontWeight(font.font_weight.value() as u32);

        // font-family
        if let Some(first) = font.font_family.families.iter().next() {
            use style::values::computed::font::SingleFontFamily;
            node.text_style.font_family = match first {
                SingleFontFamily::FamilyName(name) => name.name.to_string(),
                SingleFontFamily::Generic(generic) => format!("{:?}", generic),
            };
        }

        // font-style
        node.text_style.font_style_italic =
            font.font_style == style::values::computed::FontStyle::ITALIC;

        // color → fill
        let text_color = &style.get_inherited_text().color;
        let cg_color = abs_color_to_cg(text_color);
        node.fills = Paints::new([Paint::Solid(SolidPaint {
            color: cg_color,
            blend_mode: BlendMode::default(),
            active: true,
        })]);

        // text-align
        node.text_align = css_text_align_to_cg(style.get_inherited_text().text_align);

        // line-height
        match &font.line_height {
            LineHeight::Normal => {}
            LineHeight::Number(n) => {
                node.text_style.line_height = TextLineHeight::Factor(n.0);
            }
            LineHeight::Length(len) => {
                node.text_style.line_height = TextLineHeight::Fixed(len.0.px());
            }
        }

        // letter-spacing
        let ls = &style.get_inherited_text().letter_spacing;
        if let Some(len) = ls.0.to_length() {
            let px = len.px();
            if px != 0.0 {
                node.text_style.letter_spacing = TextLetterSpacing::Fixed(px);
            }
        }

        // word-spacing
        let ws = &style.get_inherited_text().word_spacing;
        let ws_px = ws.to_length().map(|l| l.px()).unwrap_or(0.0);
        if ws_px != 0.0 {
            node.text_style.word_spacing = TextWordSpacing::Fixed(ws_px);
        }

        // text-transform
        {
            use style::values::specified::text::TextTransformCase;
            let tt = style.clone_text_transform();
            let case = tt.case();
            node.text_style.text_transform = if case == TextTransformCase::Uppercase {
                TextTransform::Uppercase
            } else if case == TextTransformCase::Lowercase {
                TextTransform::Lowercase
            } else if case == TextTransformCase::Capitalize {
                TextTransform::Capitalize
            } else {
                TextTransform::None
            };
        }

        // text-decoration
        let td_line = style.clone_text_decoration_line();
        if td_line != StyloTextDecorationLine::NONE {
            let line = if td_line.intersects(StyloTextDecorationLine::LINE_THROUGH) {
                TextDecorationLine::LineThrough
            } else if td_line.intersects(StyloTextDecorationLine::UNDERLINE) {
                TextDecorationLine::Underline
            } else if td_line.intersects(StyloTextDecorationLine::OVERLINE) {
                TextDecorationLine::Overline
            } else {
                TextDecorationLine::None
            };

            if !matches!(line, TextDecorationLine::None) {
                node.text_style.text_decoration = Some(TextDecorationRec {
                    text_decoration_line: line,
                    text_decoration_color: None,
                    text_decoration_style: None,
                    text_decoration_skip_ink: None,
                    text_decoration_thickness: None,
                });
            }
        }

        // opacity
        node.opacity = style.get_effects().opacity;

        // flex child: layout_grow
        let flex_grow = style.clone_flex_grow();
        if flex_grow.0 > 0.0 {
            node.layout_child = Some(LayoutChildStyle {
                layout_grow: flex_grow.0,
                layout_positioning: LayoutPositioning::Auto,
            });
        }

        self.graph.append_child(Node::TextSpan(node), parent);
    }

    fn emit_rectangle(&mut self, style: &ComputedValues, parent: Parent) {
        let mut node = self.factory.create_rectangle_node();

        node.fills = css_background_to_fills(style);
        node.corner_radius = css_border_radius_to_cg(style);
        node.opacity = style.get_effects().opacity;

        // Borders
        let (border_strokes, border_stroke_width, border_stroke_style) =
            css_border_to_cg(style);
        node.strokes = border_strokes;
        node.stroke_width = border_stroke_width;
        node.stroke_style = border_stroke_style;

        // Box shadow
        node.effects = css_box_shadow_to_cg(style);

        self.graph.append_child(Node::Rectangle(node), parent);
    }
}

// ---------------------------------------------------------------------------
// CSS → CG type conversion helpers
// ---------------------------------------------------------------------------

/// Convert a Stylo computed color (GenericColor) to a CG color.
/// Returns None for fully transparent or currentcolor.
fn css_color_to_cg(
    color: &style::values::computed::Color,
) -> Option<CGColor> {
    let abs = color.as_absolute()?;
    let srgb = abs.to_color_space(ColorSpace::Srgb);
    let r = (srgb.components.0.clamp(0.0, 1.0) * 255.0) as u8;
    let g = (srgb.components.1.clamp(0.0, 1.0) * 255.0) as u8;
    let b = (srgb.components.2.clamp(0.0, 1.0) * 255.0) as u8;
    let a = (srgb.alpha.clamp(0.0, 1.0) * 255.0) as u8;
    if a == 0 {
        return None;
    }
    Some(CGColor::from_rgba(r, g, b, a))
}

/// Convert an AbsoluteColor (from the `color` property) to CG.
fn abs_color_to_cg(color: &AbsoluteColor) -> CGColor {
    let srgb = color.to_color_space(ColorSpace::Srgb);
    let r = (srgb.components.0.clamp(0.0, 1.0) * 255.0) as u8;
    let g = (srgb.components.1.clamp(0.0, 1.0) * 255.0) as u8;
    let b = (srgb.components.2.clamp(0.0, 1.0) * 255.0) as u8;
    let a = (srgb.alpha.clamp(0.0, 1.0) * 255.0) as u8;
    CGColor::from_rgba(r, g, b, a)
}

/// Extract border-radius from computed styles.
fn css_border_radius_to_cg(style: &ComputedValues) -> RectangularCornerRadius {
    let border = style.get_border();
    let lp_to_px = |lp: &style::values::computed::NonNegativeLengthPercentage| -> f32 {
        lp.0.to_length().map(|l| l.px()).unwrap_or(0.0)
    };
    RectangularCornerRadius {
        tl: Radius {
            rx: lp_to_px(&border.border_top_left_radius.0.width),
            ry: lp_to_px(&border.border_top_left_radius.0.height),
        },
        tr: Radius {
            rx: lp_to_px(&border.border_top_right_radius.0.width),
            ry: lp_to_px(&border.border_top_right_radius.0.height),
        },
        br: Radius {
            rx: lp_to_px(&border.border_bottom_right_radius.0.width),
            ry: lp_to_px(&border.border_bottom_right_radius.0.height),
        },
        bl: Radius {
            rx: lp_to_px(&border.border_bottom_left_radius.0.width),
            ry: lp_to_px(&border.border_bottom_left_radius.0.height),
        },
    }
}

struct CSSPadding {
    top: f32,
    right: f32,
    bottom: f32,
    left: f32,
}

fn css_padding_to_cg(style: &ComputedValues) -> CSSPadding {
    let p = style.get_padding();
    let lp_to_px = |lp: &style::values::computed::NonNegativeLengthPercentage| -> f32 {
        lp.0.to_length().map(|l| l.px()).unwrap_or(0.0)
    };
    CSSPadding {
        top: lp_to_px(&p.padding_top),
        right: lp_to_px(&p.padding_right),
        bottom: lp_to_px(&p.padding_bottom),
        left: lp_to_px(&p.padding_left),
    }
}

/// Convert CSS gap value to pixels. Returns 0 for `normal`.
fn gap_to_px(
    gap: &style::values::computed::length::NonNegativeLengthPercentageOrNormal,
) -> f32 {
    match gap {
        LengthPercentageOrNormal::Normal => 0.0,
        LengthPercentageOrNormal::LengthPercentage(lp) => {
            lp.0.to_length().map(|l| l.px()).unwrap_or(0.0)
        }
    }
}

/// Map CSS text-align to CG TextAlign.
fn css_text_align_to_cg(align: style::values::computed::TextAlign) -> TextAlign {
    use style::values::specified::text::TextAlignKeyword;
    match align {
        TextAlignKeyword::Start | TextAlignKeyword::Left | TextAlignKeyword::MozLeft => {
            TextAlign::Left
        }
        TextAlignKeyword::End | TextAlignKeyword::Right | TextAlignKeyword::MozRight => {
            TextAlign::Right
        }
        TextAlignKeyword::Center | TextAlignKeyword::MozCenter => TextAlign::Center,
        TextAlignKeyword::Justify => TextAlign::Justify,
    }
}

/// Convert CSS background (color + background-image gradients) to fill paints.
fn css_background_to_fills(style: &ComputedValues) -> Paints {
    use style::values::generics::image::{GenericGradient, GenericImage};

    let bg = style.get_background();
    let mut paints: Vec<Paint> = Vec::new();

    // 1. Background color (bottom layer)
    if let Some(cg_color) = css_color_to_cg(&bg.background_color) {
        paints.push(Paint::Solid(SolidPaint {
            color: cg_color,
            blend_mode: BlendMode::default(),
            active: true,
        }));
    }

    // 2. Background images (gradient layers on top)
    for image in bg.background_image.0.iter() {
        match image {
            GenericImage::Gradient(gradient) => match gradient.as_ref() {
                GenericGradient::Linear {
                    direction, items, ..
                } => {
                    let stops = gradient_items_to_stops(items);
                    if stops.is_empty() {
                        continue;
                    }
                    let (xy1, xy2) = line_direction_to_alignment(direction);
                    paints.push(Paint::LinearGradient(LinearGradientPaint {
                        active: true,
                        xy1,
                        xy2,
                        stops,
                        ..Default::default()
                    }));
                }
                GenericGradient::Radial { items, .. } => {
                    let stops = gradient_items_to_stops(items);
                    if stops.is_empty() {
                        continue;
                    }
                    paints.push(Paint::RadialGradient(RadialGradientPaint::from_stops(
                        stops,
                    )));
                }
                GenericGradient::Conic { items, .. } => {
                    let stops = conic_gradient_items_to_stops(items);
                    if stops.is_empty() {
                        continue;
                    }
                    paints.push(Paint::SweepGradient(SweepGradientPaint {
                        active: true,
                        stops,
                        ..Default::default()
                    }));
                }
            },
            _ => {}
        }
    }

    if paints.is_empty() {
        Paints::default()
    } else {
        Paints::new(paints)
    }
}

/// Convert Stylo gradient items (color stops + hints) to CG GradientStops.
fn gradient_items_to_stops(
    items: &[style::values::generics::image::GenericGradientItem<
        style::values::computed::Color,
        style::values::computed::LengthPercentage,
    >],
) -> Vec<GradientStop> {
    use style::values::generics::image::GenericGradientItem;

    // First pass: collect stops with known positions
    let mut raw: Vec<(Option<f32>, CGColor)> = Vec::new();
    for item in items {
        match item {
            GenericGradientItem::SimpleColorStop(color) => {
                let cg = css_color_to_cg(color).unwrap_or_else(|| CGColor::from_rgba(0, 0, 0, 0));
                raw.push((None, cg));
            }
            GenericGradientItem::ComplexColorStop { color, position } => {
                let offset = position
                    .to_percentage()
                    .map(|p| p.0)
                    .or_else(|| position.to_length().map(|_l| {
                        // For absolute lengths in gradients, we can't resolve without
                        // knowing the gradient line length. Treat as 0.
                        0.0
                    }));
                let cg = css_color_to_cg(color).unwrap_or_else(|| CGColor::from_rgba(0, 0, 0, 0));
                raw.push((offset, cg));
            }
            GenericGradientItem::InterpolationHint(_) => {
                // Interpolation hints change the midpoint; skip for now.
            }
        }
    }

    if raw.is_empty() {
        return Vec::new();
    }

    // Auto-distribute positions for stops without explicit offsets.
    // First stop defaults to 0.0, last to 1.0.
    let n = raw.len();
    if n > 0 {
        if raw[0].0.is_none() {
            raw[0].0 = Some(0.0);
        }
        if raw[n - 1].0.is_none() {
            raw[n - 1].0 = Some(1.0);
        }
    }

    // Fill gaps: evenly distribute between known positions
    let mut i = 0;
    while i < n {
        if raw[i].0.is_some() {
            i += 1;
            continue;
        }
        // Find the next stop with a known position
        let start = i - 1;
        let mut end = i + 1;
        while end < n && raw[end].0.is_none() {
            end += 1;
        }
        let start_offset = raw[start].0.unwrap();
        let end_offset = raw[end].0.unwrap();
        let count = (end - start) as f32;
        for j in (start + 1)..end {
            let t = (j - start) as f32 / count;
            raw[j].0 = Some(start_offset + t * (end_offset - start_offset));
        }
        i = end + 1;
    }

    raw.into_iter()
        .map(|(offset, color)| GradientStop {
            offset: offset.unwrap_or(0.0),
            color,
        })
        .collect()
}

/// Convert conic-gradient items (color stops with angle/percentage positions) to CG GradientStops.
fn conic_gradient_items_to_stops(
    items: &[style::values::generics::image::GenericGradientItem<
        style::values::computed::Color,
        style::values::computed::AngleOrPercentage,
    >],
) -> Vec<GradientStop> {
    use style::values::generics::image::GenericGradientItem;

    let mut raw: Vec<(Option<f32>, CGColor)> = Vec::new();
    for item in items {
        match item {
            GenericGradientItem::SimpleColorStop(color) => {
                let cg = css_color_to_cg(color).unwrap_or_else(|| CGColor::from_rgba(0, 0, 0, 0));
                raw.push((None, cg));
            }
            GenericGradientItem::ComplexColorStop { color, position } => {
                // Conic gradient positions are in angles or percentages (0–100% maps to 0–360deg)
                use style::values::computed::AngleOrPercentage;
                let offset = match position {
                    AngleOrPercentage::Percentage(p) => Some(p.0),
                    AngleOrPercentage::Angle(a) => Some(a.degrees() / 360.0),
                };
                let cg = css_color_to_cg(color).unwrap_or_else(|| CGColor::from_rgba(0, 0, 0, 0));
                raw.push((offset, cg));
            }
            GenericGradientItem::InterpolationHint(_) => {}
        }
    }

    if raw.is_empty() {
        return Vec::new();
    }

    // Auto-distribute (same logic as linear/radial)
    let n = raw.len();
    if raw[0].0.is_none() {
        raw[0].0 = Some(0.0);
    }
    if raw[n - 1].0.is_none() {
        raw[n - 1].0 = Some(1.0);
    }

    let mut i = 0;
    while i < n {
        if raw[i].0.is_some() {
            i += 1;
            continue;
        }
        let start = i - 1;
        let mut end = i + 1;
        while end < n && raw[end].0.is_none() {
            end += 1;
        }
        let start_offset = raw[start].0.unwrap();
        let end_offset = raw[end].0.unwrap();
        let count = (end - start) as f32;
        for j in (start + 1)..end {
            let t = (j - start) as f32 / count;
            raw[j].0 = Some(start_offset + t * (end_offset - start_offset));
        }
        i = end + 1;
    }

    raw.into_iter()
        .map(|(offset, color)| GradientStop {
            offset: offset.unwrap_or(0.0),
            color,
        })
        .collect()
}

/// Convert CSS linear-gradient direction to IR Alignment endpoints.
///
/// CSS gradient angles: 0deg = to top, 90deg = to right, 180deg = to bottom.
/// IR Alignment: (-1,-1) = top-left, (0,0) = center, (1,1) = bottom-right.
fn line_direction_to_alignment(
    direction: &style::values::computed::image::LineDirection,
) -> (Alignment, Alignment) {
    use style::values::computed::image::LineDirection;

    match direction {
        LineDirection::Angle(angle) => {
            // CSS: 0deg = to top, clockwise. Convert to math angle.
            let rad = angle.radians();
            let sin = rad.sin();
            let cos = rad.cos();
            // CSS gradient line: from (-sin, cos) to (sin, -cos) in NDC
            let xy1 = Alignment(-sin, cos);
            let xy2 = Alignment(sin, -cos);
            (xy1, xy2)
        }
        LineDirection::Vertical(v) => match v {
            VerticalPositionKeyword::Top => (Alignment::BOTTOM_CENTER, Alignment::TOP_CENTER),
            VerticalPositionKeyword::Bottom => (Alignment::TOP_CENTER, Alignment::BOTTOM_CENTER),
        },
        LineDirection::Horizontal(h) => match h {
            HorizontalPositionKeyword::Left => {
                (Alignment::CENTER_RIGHT, Alignment::CENTER_LEFT)
            }
            HorizontalPositionKeyword::Right => {
                (Alignment::CENTER_LEFT, Alignment::CENTER_RIGHT)
            }
        },
        LineDirection::Corner(h, v) => {
            let x1 = match h {
                HorizontalPositionKeyword::Left => 1.0,
                HorizontalPositionKeyword::Right => -1.0,
            };
            let y1 = match v {
                VerticalPositionKeyword::Top => 1.0,
                VerticalPositionKeyword::Bottom => -1.0,
            };
            (Alignment(x1, y1), Alignment(-x1, -y1))
        }
    }
}

/// Convert CSS border properties to CG strokes, stroke width, and stroke style.
fn css_border_to_cg(style: &ComputedValues) -> (Paints, StrokeWidth, StrokeStyle) {
    let border = style.get_border();

    let top_w = border.border_top_width.to_f32_px();
    let right_w = border.border_right_width.to_f32_px();
    let bottom_w = border.border_bottom_width.to_f32_px();
    let left_w = border.border_left_width.to_f32_px();

    let has_border = top_w > 0.0 || right_w > 0.0 || bottom_w > 0.0 || left_w > 0.0;
    if !has_border {
        return (Paints::default(), StrokeWidth::None, StrokeStyle::default());
    }

    // Use the top border color as the primary stroke color (most common single-color case).
    // For per-side colors, we use the first visible border side.
    let border_color = css_color_to_cg(&border.border_top_color)
        .or_else(|| css_color_to_cg(&border.border_right_color))
        .or_else(|| css_color_to_cg(&border.border_bottom_color))
        .or_else(|| css_color_to_cg(&border.border_left_color));

    let strokes = match border_color {
        Some(color) => Paints::new([Paint::Solid(SolidPaint {
            color,
            blend_mode: BlendMode::default(),
            active: true,
        })]),
        None => return (Paints::default(), StrokeWidth::None, StrokeStyle::default()),
    };

    // Stroke width: use rectangular if sides differ, uniform otherwise
    let stroke_width = if top_w == right_w && right_w == bottom_w && bottom_w == left_w {
        StrokeWidth::Uniform(top_w)
    } else {
        StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: top_w,
            stroke_right_width: right_w,
            stroke_bottom_width: bottom_w,
            stroke_left_width: left_w,
        })
    };

    // Stroke style: map border-style to dash array
    let top_style = border.border_top_style;
    let dash_array = match top_style {
        BorderStyle::Dashed => Some(StrokeDashArray(vec![4.0, 4.0])),
        BorderStyle::Dotted => Some(StrokeDashArray(vec![1.0, 1.0])),
        _ => None,
    };

    let stroke_style = StrokeStyle {
        stroke_align: StrokeAlign::Inside,
        stroke_cap: StrokeCap::Butt,
        stroke_join: StrokeJoin::Miter,
        stroke_miter_limit: StrokeMiterLimit::default(),
        stroke_dash_array: dash_array,
    };

    (strokes, stroke_width, stroke_style)
}

/// Convert CSS box-shadow to CG LayerEffects.
fn css_box_shadow_to_cg(style: &ComputedValues) -> LayerEffects {
    let shadow_list = style.clone_box_shadow();
    let mut shadows = Vec::new();

    for shadow in shadow_list.0.iter() {
        let color = css_color_to_cg(&shadow.base.color)
            .unwrap_or_else(|| CGColor::from_rgba(0, 0, 0, 255));

        let fe = FeShadow {
            dx: shadow.base.horizontal.px(),
            dy: shadow.base.vertical.px(),
            blur: shadow.base.blur.px(),
            spread: shadow.spread.px(),
            color,
            active: true,
        };

        if shadow.inset {
            shadows.push(FilterShadowEffect::InnerShadow(fe));
        } else {
            shadows.push(FilterShadowEffect::DropShadow(fe));
        }
    }

    LayerEffects {
        blur: None,
        backdrop_blur: None,
        shadows,
        glass: None,
        noises: Vec::new(),
    }
}

/// Map CSS width/height/min/max dimensions to LayoutDimensionStyle.
fn css_dimensions_to_cg(style: &ComputedValues, dims: &mut LayoutDimensionStyle) {
    let pos = style.get_position();

    // width
    match &pos.width {
        GenericSize::LengthPercentage(lp) => {
            if let Some(len) = lp.0.to_length() {
                dims.layout_target_width = Some(len.px());
            }
        }
        GenericSize::Auto => {
            dims.layout_target_width = None;
        }
        _ => {}
    }

    // height
    match &pos.height {
        GenericSize::LengthPercentage(lp) => {
            if let Some(len) = lp.0.to_length() {
                dims.layout_target_height = Some(len.px());
            }
        }
        GenericSize::Auto => {
            dims.layout_target_height = None;
        }
        _ => {}
    }

    // min-width
    match &pos.min_width {
        GenericSize::LengthPercentage(lp) => {
            if let Some(len) = lp.0.to_length() {
                let px = len.px();
                if px > 0.0 {
                    dims.layout_min_width = Some(px);
                }
            }
        }
        _ => {}
    }

    // min-height
    match &pos.min_height {
        GenericSize::LengthPercentage(lp) => {
            if let Some(len) = lp.0.to_length() {
                let px = len.px();
                if px > 0.0 {
                    dims.layout_min_height = Some(px);
                }
            }
        }
        _ => {}
    }

    // max-width
    match &pos.max_width {
        GenericMaxSize::LengthPercentage(lp) => {
            if let Some(len) = lp.0.to_length() {
                dims.layout_max_width = Some(len.px());
            }
        }
        _ => {}
    }

    // max-height
    match &pos.max_height {
        GenericMaxSize::LengthPercentage(lp) => {
            if let Some(len) = lp.0.to_length() {
                dims.layout_max_height = Some(len.px());
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_test_basic_html() {
        let html = r#"<!doctype html>
<html>
  <head>
    <style>
      body { background: #f5f5f5; color: #222; font-family: sans-serif; }
      h1 { font-size: 32px; color: hotpink; }
      .card { display: flex; gap: 12px; padding: 16px; background: white; border-radius: 8px; }
    </style>
  </head>
  <body>
    <h1>Hello</h1>
    <div class="card">
      <p>Paragraph text</p>
    </div>
  </body>
</html>"#;

        let graph = from_html_str(html).expect("should parse and convert HTML");
        // We should have at least a few nodes: html > body > h1, div.card > p
        assert!(
            graph.node_count() > 3,
            "expected at least 4 nodes, got {}",
            graph.node_count()
        );
    }

    #[test]
    fn test_inline_style_attribute() {
        let html = r#"<!doctype html>
<html>
  <body>
    <div style="font-size: 20px; color: red;">Styled inline</div>
  </body>
</html>"#;
        let graph = from_html_str(html).expect("should parse inline styles");
        assert!(graph.node_count() >= 3);
    }

    #[test]
    fn test_borders_and_shadows() {
        let html = r#"<!doctype html>
<html>
  <head>
    <style>
      .box { border: 2px solid #333; box-shadow: 4px 4px 8px rgba(0,0,0,0.3); }
    </style>
  </head>
  <body>
    <div class="box">bordered</div>
  </body>
</html>"#;
        let graph = from_html_str(html).expect("should parse borders and shadows");
        assert!(graph.node_count() >= 3);
    }

    #[test]
    fn test_flex_alignment() {
        let html = r#"<!doctype html>
<html>
  <head>
    <style>
      .flex { display: flex; align-items: center; justify-content: space-between; }
    </style>
  </head>
  <body>
    <div class="flex">
      <span>A</span>
      <span>B</span>
    </div>
  </body>
</html>"#;
        let graph = from_html_str(html).expect("should parse flex alignment");
        assert!(graph.node_count() >= 4);
    }

    #[test]
    fn test_gradient_backgrounds() {
        let html = r#"<!doctype html>
<html>
  <head>
    <style>
      .linear { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
      .radial { background: radial-gradient(circle, #ff0000, #0000ff); }
    </style>
  </head>
  <body>
    <div class="linear">linear</div>
    <div class="radial">radial</div>
  </body>
</html>"#;
        let graph = from_html_str(html).expect("should parse gradient backgrounds");
        assert!(graph.node_count() >= 4);
    }
}
