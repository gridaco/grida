//! HTML → Grida IR conversion.
//!
//! Parses HTML, resolves all CSS styles via Stylo (through [`csscascade`]),
//! and converts the styled DOM tree into a Grida [`SceneGraph`].
//!
//! This is the HTML counterpart to the SVG import pipeline in [`crate::svg`].
//!
//! **Property mapping tracker:** `docs/wg/format/css.md` and `docs/wg/format/html.md`
//! track which CSS properties and HTML elements are mapped, partially mapped, or blocked.

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
///
/// # Thread Safety
///
/// This function uses a process-global DOM slot ([`csscascade::adapter::DEMO_DOM`])
/// and is **not thread-safe**. Concurrent calls will race on the shared state.
/// Callers must serialize access externally (e.g. via a mutex).
pub fn from_html_str(html: &str) -> Result<SceneGraph, String> {
    // Ensure Stylo thread state is initialized (idempotent after first call).
    let _ = thread_state::initialize(ThreadState::LAYOUT);

    // 1. Parse HTML into arena DOM
    let dom =
        DemoDom::parse_from_bytes(html.as_bytes()).map_err(|e| format!("HTML parse error: {e}"))?;

    // 2. Build cascade driver (collects <style> blocks, builds UA + author sheets)
    let mut driver = CascadeDriver::new(&dom);

    // 3. Install DOM into global slot
    let document = adapter::bootstrap_dom(dom);

    // 4. Flush stylist + resolve all styles
    driver.flush(document);
    let _styled_count = driver.style_document(document);
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
            node.children.iter().any(
                |cid| matches!(&dom.node(*cid).data, DemoNodeData::Text(t) if !t.trim().is_empty()),
            )
        };

        let is_structural = matches!(tag.as_str(), "html" | "body");

        // Check if all element children are inline (display: inline).
        // When true and we have text, we can merge everything into AttributedText.
        let all_children_inline = has_element_children && {
            let mut all_inline = true;
            let mut child = element.first_element_child();
            while let Some(c) = child {
                let c_data = c.borrow_data();
                if let Some(c_data) = &c_data {
                    let c_display = c_data.styles.primary().clone_display();
                    if c_display.outside() != style::values::specified::box_::DisplayOutside::Inline
                    {
                        all_inline = false;
                        break;
                    }
                }
                child = c.next_element_sibling();
            }
            all_inline
        };

        if has_text_children && all_children_inline && !is_structural {
            // All children are text or inline elements → emit as a single
            // Container (for box model) with an AttributedText child (for text).
            let container_id = self.emit_container(style, &display, parent);
            self.emit_attributed_text(element, style, Parent::NodeId(container_id));
        } else if has_element_children || has_text_children || is_structural {
            // Mixed content or structural element → Container with separate children.
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

    /// Wrap a node in a transparent container whose padding equals the CSS margin.
    /// The wrapper inherits the `layout_child` role (grow, positioning) from the
    /// original node so it occupies the correct slot in the parent's flex layout.
    /// Returns the wrapper's NodeId — the caller should append content into it.
    fn wrap_with_margin_padding(
        &mut self,
        margin: &CSSMargin,
        layout_child: Option<LayoutChildStyle>,
        parent: Parent,
    ) -> NodeId {
        let mut wrapper = self.factory.create_container_node();
        wrapper.fills = Paints::default(); // transparent — no visual
        wrapper.strokes = Default::default();
        wrapper.stroke_width = StrokeWidth::default();
        wrapper.layout_container.layout_mode = LayoutMode::Flex;
        wrapper.layout_container.layout_direction = Axis::Vertical;
        // Clear factory default 100×100 — wrapper should auto-size to content.
        wrapper.layout_dimensions.layout_target_width = None;
        wrapper.layout_dimensions.layout_target_height = None;
        wrapper.layout_container.layout_padding = Some(EdgeInsets {
            top: margin.top,
            right: margin.right,
            bottom: margin.bottom,
            left: margin.left,
        });
        wrapper.layout_child = layout_child;
        self.graph.append_child(Node::Container(wrapper), parent)
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
        // CSS column-gap = inline-axis gap, row-gap = block-axis gap.
        // For flex-direction: row, column-gap is the main-axis gap.
        // For flex-direction: column, row-gap is the main-axis gap.
        if is_flex {
            let pos = style.get_position();
            let rg = gap_to_px(&pos.row_gap);
            let cg = gap_to_px(&pos.column_gap);
            if rg != 0.0 || cg != 0.0 {
                let (main_gap, cross_gap) = match style.clone_flex_direction() {
                    FlexDir::Row | FlexDir::RowReverse => (cg, rg),
                    FlexDir::Column | FlexDir::ColumnReverse => (rg, cg),
                };
                node.layout_container.layout_gap = Some(LayoutGap {
                    main_axis_gap: main_gap,
                    cross_axis_gap: cross_gap,
                });
            }
        }

        // Overflow → clip
        let bx = style.get_box();
        node.clip = bx.overflow_x != style::values::specified::box_::Overflow::Visible
            || bx.overflow_y != style::values::specified::box_::Overflow::Visible;

        // Borders → strokes + stroke_width
        let (border_strokes, border_stroke_width, border_stroke_style) = css_border_to_cg(style);
        node.strokes = border_strokes;
        node.stroke_width = border_stroke_width;
        node.stroke_style = border_stroke_style;

        // Effects (box-shadow, filter, backdrop-filter)
        node.effects = css_effects_to_cg(style);

        // Blend mode (mix-blend-mode)
        node.blend_mode = css_blend_mode_to_cg(style);

        // Width / height / min / max dimensions
        css_dimensions_to_cg(style, &mut node.layout_dimensions);

        // Flex child properties (for nested containers inside flex parents)
        node.layout_child = css_flex_child_to_cg(style);

        // Margin → tree surgery
        // Fixed positive margins are absorbed into the container's own padding when
        // the container has no visual properties (fills, borders) that would bleed
        // into the margin zone. Otherwise, a separate wrapper is created.
        let margin = css_margin_to_cg(style);
        if !margin.is_zero() && !margin.has_any_auto() && !margin.has_any_negative() {
            let has_visuals = !node.fills.is_empty() || !node.strokes.is_empty();
            if has_visuals {
                // Container has background/border — margin must stay outside.
                // Wrap in a transparent container whose padding = margin.
                let layout_child = node.layout_child.take();
                let wrapper_id = self.wrap_with_margin_padding(&margin, layout_child, parent);
                self.graph
                    .append_child(Node::Container(node), Parent::NodeId(wrapper_id))
            } else {
                // No visual properties — safe to merge margin into padding.
                // This avoids an extra wrapper node in the tree.
                let existing = node
                    .layout_container
                    .layout_padding
                    .unwrap_or(EdgeInsets::zero());
                node.layout_container.layout_padding = Some(EdgeInsets {
                    top: existing.top + margin.top,
                    right: existing.right + margin.right,
                    bottom: existing.bottom + margin.bottom,
                    left: existing.left + margin.left,
                });
                self.graph.append_child(Node::Container(node), parent)
            }
        } else {
            // TODO(margin): auto margins require SpacerNode siblings (not yet implemented).
            // TODO(margin): negative margins require negative offset support (not planned).
            self.graph.append_child(Node::Container(node), parent)
        }
    }

    fn emit_text_span(&mut self, text: &str, style: &ComputedValues, parent: Parent) {
        let mut node = self.factory.create_text_span_node();
        node.text = text.to_string();

        let (text_style, fills) = css_text_style_to_cg(style);
        node.text_style = text_style;
        node.fills = fills;
        node.text_align = css_text_align_to_cg(style.get_inherited_text().text_align);
        node.opacity = style.get_effects().opacity;
        node.effects = css_text_shadow_to_effects(style);
        node.blend_mode = css_blend_mode_to_cg(style);

        let flex_grow = style.clone_flex_grow();
        if flex_grow.0 > 0.0 {
            node.layout_child = Some(LayoutChildStyle {
                layout_grow: flex_grow.0,
                layout_positioning: LayoutPositioning::Auto,
            });
        }

        // NOTE: No margin surgery for text spans. Text spans are emitted using
        // the parent element's style (see build_element), which may carry
        // the parent's margin. Margin is handled at the container/rectangle level.
        self.graph.append_child(Node::TextSpan(node), parent);
    }

    /// Emit an `AttributedTextNodeRec` by merging all inline children (text nodes
    /// and inline elements like `<strong>`, `<em>`, `<code>`) into a single rich
    /// text node with per-run styling.
    fn emit_attributed_text(
        &mut self,
        element: HtmlElement,
        style: &ComputedValues,
        parent: Parent,
    ) {
        let dom = adapter::dom();
        let (default_style, default_fills) = css_text_style_to_cg(style);
        let default_color = Some(abs_color_to_cg(&style.get_inherited_text().color));

        let mut builder = AttributedStringBuilder::new();
        let node_data = dom.node(element.node_id());

        // Walk children in DOM order — interleaved text nodes and inline elements.
        // Use CSS white-space collapsing: newlines/tabs → space, collapse runs of spaces.
        for child_id in &node_data.children {
            let child_node = dom.node(*child_id);
            match &child_node.data {
                DemoNodeData::Text(text) => {
                    let collapsed = collapse_whitespace(text);
                    if !collapsed.is_empty() {
                        builder = builder.push(&collapsed, &default_style, default_color);
                    }
                }
                DemoNodeData::Element(_) => {
                    // Inline element — get its own computed style and collect text.
                    let child_el = HtmlElement::from_node_id(*child_id);
                    let child_data = child_el.borrow_data();
                    if let Some(child_data) = &child_data {
                        let child_style = child_data.styles.primary();
                        Self::collect_inline_text(&mut builder, child_el, child_style);
                    }
                }
                _ => {} // comments, doctypes, etc. — skip
            }
        }

        // If nothing was collected (whitespace-only source), skip.
        if builder.is_empty() {
            return;
        }
        let mut attr_string = builder.build();
        attr_string.merge_adjacent_runs();

        let node = AttributedTextNodeRec {
            active: true,
            transform: Default::default(),
            width: None,
            height: None,
            layout_child: css_flex_child_to_cg(style),
            attributed_string: attr_string,
            default_style,
            text_align: css_text_align_to_cg(style.get_inherited_text().text_align),
            text_align_vertical: TextAlignVertical::Top,
            max_lines: None,
            ellipsis: None,
            fills: default_fills,
            strokes: Default::default(),
            stroke_width: 0.0,
            stroke_align: StrokeAlign::default(),
            opacity: style.get_effects().opacity,
            blend_mode: css_blend_mode_to_cg(style),
            mask: None,
            effects: css_text_shadow_to_effects(style),
        };

        self.graph.append_child(Node::AttributedText(node), parent);
    }

    /// Recursively collect text from an inline element and its children into the builder.
    fn collect_inline_text(
        builder: &mut AttributedStringBuilder,
        element: HtmlElement,
        style: &ComputedValues,
    ) {
        let dom = adapter::dom();
        let (run_style, _) = css_text_style_to_cg(style);
        let run_color = Some(abs_color_to_cg(&style.get_inherited_text().color));
        let node_data = dom.node(element.node_id());

        for child_id in &node_data.children {
            let child_node = dom.node(*child_id);
            match &child_node.data {
                DemoNodeData::Text(text) => {
                    let collapsed = collapse_whitespace(text);
                    if !collapsed.is_empty() {
                        *builder =
                            std::mem::take(builder).push(&collapsed, &run_style, run_color);
                    }
                }
                DemoNodeData::Element(_) => {
                    let child_el = HtmlElement::from_node_id(*child_id);
                    let child_data = child_el.borrow_data();
                    if let Some(child_data) = &child_data {
                        let child_style = child_data.styles.primary();
                        Self::collect_inline_text(builder, child_el, child_style);
                    }
                }
                _ => {}
            }
        }
    }

    fn emit_rectangle(&mut self, style: &ComputedValues, parent: Parent) {
        let mut node = self.factory.create_rectangle_node();

        node.fills = css_background_to_fills(style);
        node.corner_radius = css_border_radius_to_cg(style);
        node.opacity = style.get_effects().opacity;

        // CSS dimensions → node size
        node.size = css_size_to_cg(style);

        // Flex child properties (grow, positioning)
        node.layout_child = css_flex_child_to_cg(style);

        // Borders
        let (border_strokes, border_stroke_width, border_stroke_style) = css_border_to_cg(style);
        node.strokes = border_strokes;
        node.stroke_width = border_stroke_width;
        node.stroke_style = border_stroke_style;

        // Effects (box-shadow, filter, backdrop-filter)
        node.effects = css_effects_to_cg(style);

        // Blend mode (mix-blend-mode)
        node.blend_mode = css_blend_mode_to_cg(style);

        // Margin → tree surgery (same pattern as emit_container)
        let margin = css_margin_to_cg(style);
        if !margin.is_zero() && !margin.has_any_auto() && !margin.has_any_negative() {
            let layout_child = node.layout_child.take();
            let wrapper_id = self.wrap_with_margin_padding(&margin, layout_child, parent);
            self.graph
                .append_child(Node::Rectangle(node), Parent::NodeId(wrapper_id));
        } else {
            // TODO(margin): auto/negative margins not supported for rectangles.
            self.graph.append_child(Node::Rectangle(node), parent);
        }
    }
}

// ---------------------------------------------------------------------------
// CSS → CG type conversion helpers
// ---------------------------------------------------------------------------

/// Convert a Stylo computed color (GenericColor) to a CG color.
/// Returns None for fully transparent or currentcolor.
fn css_color_to_cg(color: &style::values::computed::Color) -> Option<CGColor> {
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

/// Parsed CSS margin with per-edge auto tracking.
struct CSSMargin {
    top: f32,
    right: f32,
    bottom: f32,
    left: f32,
    top_auto: bool,
    right_auto: bool,
    bottom_auto: bool,
    left_auto: bool,
}

impl CSSMargin {
    fn is_zero(&self) -> bool {
        !self.top_auto
            && !self.right_auto
            && !self.bottom_auto
            && !self.left_auto
            && self.top == 0.0
            && self.right == 0.0
            && self.bottom == 0.0
            && self.left == 0.0
    }

    fn has_any_auto(&self) -> bool {
        self.top_auto || self.right_auto || self.bottom_auto || self.left_auto
    }

    fn has_any_negative(&self) -> bool {
        self.top < 0.0 || self.right < 0.0 || self.bottom < 0.0 || self.left < 0.0
    }
}

fn css_margin_to_cg(style: &ComputedValues) -> CSSMargin {
    // Stylo exposes margin fields as `computed::Margin` (GenericMargin<LengthPercentage>).
    // Variants: Auto | LengthPercentage(lp) | AnchorSizeFunction (CSS anchoring, ignored).
    fn extract(v: style::values::computed::Margin) -> (f32, bool) {
        if v.is_auto() {
            return (0.0, true);
        }
        match v {
            style::values::computed::Margin::LengthPercentage(lp) => {
                (lp.to_length().map(|l| l.px()).unwrap_or(0.0), false)
            }
            _ => (0.0, false),
        }
    }

    let (top, top_auto) = extract(style.clone_margin_top());
    let (right, right_auto) = extract(style.clone_margin_right());
    let (bottom, bottom_auto) = extract(style.clone_margin_bottom());
    let (left, left_auto) = extract(style.clone_margin_left());
    CSSMargin {
        top,
        right,
        bottom,
        left,
        top_auto,
        right_auto,
        bottom_auto,
        left_auto,
    }
}

/// Collapse whitespace per CSS `white-space: normal` rules.
/// Newlines and tabs become spaces; consecutive spaces collapse to one.
/// Leading/trailing whitespace is preserved as a single space (important for
/// inline text runs where `"Hello "` + `"world"` must keep the space).
fn collapse_whitespace(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut prev_was_space = false;
    for ch in s.chars() {
        if ch.is_ascii_whitespace() {
            if !prev_was_space {
                result.push(' ');
                prev_was_space = true;
            }
        } else {
            result.push(ch);
            prev_was_space = false;
        }
    }
    result
}

/// Extract text typography (TextStyleRec) and fill color from CSS computed values.
/// Shared by emit_text_span and emit_attributed_text.
fn css_text_style_to_cg(style: &ComputedValues) -> (TextStyleRec, Paints) {
    let font = style.get_font();
    let mut text_style = TextStyleRec::from_font("system-ui", 16.0);

    text_style.font_size = font.font_size.computed_size().px();
    text_style.font_weight = FontWeight(font.font_weight.value() as u32);

    if let Some(first) = font.font_family.families.iter().next() {
        use style::values::computed::font::SingleFontFamily;
        text_style.font_family = match first {
            SingleFontFamily::FamilyName(name) => name.name.to_string(),
            SingleFontFamily::Generic(generic) => format!("{:?}", generic),
        };
    }

    text_style.font_style_italic = font.font_style == style::values::computed::FontStyle::ITALIC;

    match &font.line_height {
        LineHeight::Normal => {}
        LineHeight::Number(n) => {
            text_style.line_height = TextLineHeight::Factor(n.0);
        }
        LineHeight::Length(len) => {
            text_style.line_height = TextLineHeight::Fixed(len.0.px());
        }
    }

    let ls = &style.get_inherited_text().letter_spacing;
    if let Some(len) = ls.0.to_length() {
        let px = len.px();
        if px != 0.0 {
            text_style.letter_spacing = TextLetterSpacing::Fixed(px);
        }
    }

    let ws = &style.get_inherited_text().word_spacing;
    let ws_px = ws.to_length().map(|l| l.px()).unwrap_or(0.0);
    if ws_px != 0.0 {
        text_style.word_spacing = TextWordSpacing::Fixed(ws_px);
    }

    {
        use style::values::specified::text::TextTransformCase;
        let tt = style.clone_text_transform();
        let case = tt.case();
        text_style.text_transform = if case == TextTransformCase::Uppercase {
            TextTransform::Uppercase
        } else if case == TextTransformCase::Lowercase {
            TextTransform::Lowercase
        } else if case == TextTransformCase::Capitalize {
            TextTransform::Capitalize
        } else {
            TextTransform::None
        };
    }

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
            let td_color = css_color_to_cg(&style.clone_text_decoration_color());
            let td_style = css_text_decoration_style_to_cg(style);
            text_style.text_decoration = Some(TextDecorationRec {
                text_decoration_line: line,
                text_decoration_color: td_color,
                text_decoration_style: td_style,
                text_decoration_skip_ink: None,
                text_decoration_thickness: None,
            });
        }
    }

    let text_color = &style.get_inherited_text().color;
    let cg_color = abs_color_to_cg(text_color);
    let fills = Paints::new([Paint::Solid(SolidPaint {
        color: cg_color,
        blend_mode: BlendMode::default(),
        active: true,
    })]);

    (text_style, fills)
}

/// Convert CSS gap value to pixels. Returns 0 for `normal`.
fn gap_to_px(gap: &style::values::computed::length::NonNegativeLengthPercentageOrNormal) -> f32 {
    match gap {
        LengthPercentageOrNormal::Normal => 0.0,
        LengthPercentageOrNormal::LengthPercentage(lp) => {
            lp.0.to_length().map(|l| l.px()).unwrap_or(0.0)
        }
    }
}

/// Extract flex-child properties (flex-grow, positioning) from CSS computed values.
/// Returns `None` when all values are at their defaults (grow=0, position=static/relative).
fn css_flex_child_to_cg(style: &ComputedValues) -> Option<LayoutChildStyle> {
    let grow = style.clone_flex_grow().0;
    let is_absolute = style.get_box().clone_position().is_absolutely_positioned();
    let positioning = if is_absolute {
        LayoutPositioning::Absolute
    } else {
        LayoutPositioning::Auto
    };

    if grow > 0.0 || is_absolute {
        Some(LayoutChildStyle {
            layout_grow: grow,
            layout_positioning: positioning,
        })
    } else {
        None
    }
}

/// Extract CSS width/height into a Size for leaf nodes (Rectangle, etc.).
/// Returns 0×0 when dimensions are `auto` — unlike the design-tool convention
/// (100×100 default), HTML leaf elements have no intrinsic size.
fn css_size_to_cg(style: &ComputedValues) -> Size {
    let pos = style.get_position();
    let w = match &pos.width {
        GenericSize::LengthPercentage(lp) => lp.0.to_length().map(|l| l.px()).unwrap_or(0.0),
        _ => 0.0,
    };
    let h = match &pos.height {
        GenericSize::LengthPercentage(lp) => lp.0.to_length().map(|l| l.px()).unwrap_or(0.0),
        _ => 0.0,
    };
    Size {
        width: w,
        height: h,
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
                let offset = position.to_percentage().map(|p| p.0).or_else(|| {
                    position.to_length().map(|_l| {
                        // For absolute lengths in gradients, we can't resolve without
                        // knowing the gradient line length. Treat as 0.
                        0.0
                    })
                });
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
            HorizontalPositionKeyword::Left => (Alignment::CENTER_RIGHT, Alignment::CENTER_LEFT),
            HorizontalPositionKeyword::Right => (Alignment::CENTER_LEFT, Alignment::CENTER_RIGHT),
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

/// Convert CSS effects (box-shadow, filter, backdrop-filter) to CG LayerEffects.
fn css_effects_to_cg(style: &ComputedValues) -> LayerEffects {
    use style::values::generics::effects::Filter;

    let mut shadows = Vec::new();
    let mut blur = None;
    let mut backdrop_blur = None;

    // box-shadow → shadows
    let shadow_list = style.clone_box_shadow();
    for shadow in shadow_list.0.iter() {
        let color =
            css_color_to_cg(&shadow.base.color).unwrap_or_else(|| CGColor::from_rgba(0, 0, 0, 255));

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

    // filter → blur + drop-shadow
    let filter_list = style.clone_filter();
    for f in filter_list.0.iter() {
        match f {
            Filter::Blur(len) => {
                blur = Some(FeLayerBlur::from(len.px()));
            }
            Filter::DropShadow(s) => {
                let color =
                    css_color_to_cg(&s.color).unwrap_or_else(|| CGColor::from_rgba(0, 0, 0, 255));
                shadows.push(FilterShadowEffect::DropShadow(FeShadow {
                    dx: s.horizontal.px(),
                    dy: s.vertical.px(),
                    blur: s.blur.px(),
                    spread: 0.0,
                    color,
                    active: true,
                }));
            }
            _ => {}
        }
    }

    // backdrop-filter → backdrop_blur
    let bd_list = style.clone_backdrop_filter();
    for f in bd_list.0.iter() {
        if let Filter::Blur(len) = f {
            backdrop_blur = Some(FeBackdropBlur::from(len.px()));
        }
    }

    LayerEffects {
        blur,
        backdrop_blur,
        shadows,
        glass: None,
        noises: Vec::new(),
    }
}

/// Convert CSS text-shadow to CG LayerEffects (for text nodes).
fn css_text_shadow_to_effects(style: &ComputedValues) -> LayerEffects {
    let ts_list = style.clone_text_shadow();
    let mut shadows = Vec::new();

    for s in ts_list.0.iter() {
        let color = css_color_to_cg(&s.color).unwrap_or_else(|| CGColor::from_rgba(0, 0, 0, 255));

        shadows.push(FilterShadowEffect::DropShadow(FeShadow {
            dx: s.horizontal.px(),
            dy: s.vertical.px(),
            blur: s.blur.px(),
            spread: 0.0,
            color,
            active: true,
        }));
    }

    // Text nodes also support filter/backdrop-filter
    let mut base = css_effects_to_cg(style);
    base.shadows.extend(shadows);
    base
}

/// Convert CSS mix-blend-mode to CG LayerBlendMode.
fn css_blend_mode_to_cg(style: &ComputedValues) -> LayerBlendMode {
    use style::computed_values::mix_blend_mode::T as MixBlendMode;

    match style.clone_mix_blend_mode() {
        MixBlendMode::Normal => LayerBlendMode::PassThrough,
        MixBlendMode::Multiply => LayerBlendMode::Blend(BlendMode::Multiply),
        MixBlendMode::Screen => LayerBlendMode::Blend(BlendMode::Screen),
        MixBlendMode::Overlay => LayerBlendMode::Blend(BlendMode::Overlay),
        MixBlendMode::Darken => LayerBlendMode::Blend(BlendMode::Darken),
        MixBlendMode::Lighten => LayerBlendMode::Blend(BlendMode::Lighten),
        MixBlendMode::ColorDodge => LayerBlendMode::Blend(BlendMode::ColorDodge),
        MixBlendMode::ColorBurn => LayerBlendMode::Blend(BlendMode::ColorBurn),
        MixBlendMode::HardLight => LayerBlendMode::Blend(BlendMode::HardLight),
        MixBlendMode::SoftLight => LayerBlendMode::Blend(BlendMode::SoftLight),
        MixBlendMode::Difference => LayerBlendMode::Blend(BlendMode::Difference),
        MixBlendMode::Exclusion => LayerBlendMode::Blend(BlendMode::Exclusion),
        MixBlendMode::Hue => LayerBlendMode::Blend(BlendMode::Hue),
        MixBlendMode::Saturation => LayerBlendMode::Blend(BlendMode::Saturation),
        MixBlendMode::Color => LayerBlendMode::Blend(BlendMode::Color),
        MixBlendMode::Luminosity => LayerBlendMode::Blend(BlendMode::Luminosity),
        _ => LayerBlendMode::PassThrough,
    }
}

/// Convert CSS text-decoration-style to CG TextDecorationStyle.
fn css_text_decoration_style_to_cg(style: &ComputedValues) -> Option<TextDecorationStyle> {
    use style::computed_values::text_decoration_style::T as TDS;

    match style.clone_text_decoration_style() {
        TDS::Solid => Some(TextDecorationStyle::Solid),
        TDS::Double => Some(TextDecorationStyle::Double),
        TDS::Dotted => Some(TextDecorationStyle::Dotted),
        TDS::Dashed => Some(TextDecorationStyle::Dashed),
        TDS::Wavy => Some(TextDecorationStyle::Wavy),
        _ => None,
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
    use crate::layout::engine::LayoutEngine;
    use crate::layout::ComputedLayout;
    use crate::node::schema::Scene;
    use std::collections::HashMap;
    use std::sync::Mutex;

    /// Global mutex to serialize HTML tests.
    ///
    /// The CSS cascade adapter uses a process-global `DEMO_DOM` static, so
    /// concurrent `from_html_str` calls race on that shared slot and cause
    /// Stylo `debug_assert` panics ("Why are we here?").  A mutex ensures
    /// only one test touches the global DOM at a time.
    ///
    /// We use `lock().unwrap_or_else(|e| e.into_inner())` to recover from
    /// poison so that a single test failure doesn't cascade to all others.
    static HTML_TEST_LOCK: Mutex<()> = Mutex::new(());

    /// Lock the HTML test mutex, clearing poison if a prior test panicked.
    fn lock_html() -> std::sync::MutexGuard<'static, ()> {
        HTML_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Parse HTML and run the layout engine, returning the scene and a
    /// map of every node's computed layout.
    fn html_layout(html: &str, vw: f32, vh: f32) -> (Scene, HashMap<NodeId, ComputedLayout>) {
        let graph = from_html_str(html).expect("HTML parse failed");
        let scene = Scene {
            name: "html-test".to_string(),
            graph,
            background_color: None,
        };
        let mut engine = LayoutEngine::new();
        let result = engine.compute(
            &scene,
            Size {
                width: vw,
                height: vh,
            },
            None,
        );
        let map: HashMap<NodeId, ComputedLayout> = result.iter().map(|(k, v)| (k, *v)).collect();
        (scene, map)
    }

    /// Collect all NodeIds in DFS order (pre-order).
    fn dfs_nodes(graph: &SceneGraph) -> Vec<NodeId> {
        let mut out = Vec::new();
        fn walk(graph: &SceneGraph, id: &NodeId, out: &mut Vec<NodeId>) {
            out.push(*id);
            if let Some(children) = graph.get_children(id) {
                for child_id in children {
                    walk(graph, child_id, out);
                }
            }
        }
        for root in graph.roots() {
            walk(graph, root, &mut out);
        }
        out
    }

    // -----------------------------------------------------------------------
    // Smoke / parsing tests (existing)
    // -----------------------------------------------------------------------

    #[test]
    fn smoke_test_basic_html() {
        let _guard = lock_html();
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
        assert!(
            graph.node_count() > 3,
            "expected at least 4 nodes, got {}",
            graph.node_count()
        );
    }

    #[test]
    fn test_inline_style_attribute() {
        let _guard = lock_html();
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
        let _guard = lock_html();
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
        let _guard = lock_html();
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
        let _guard = lock_html();
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

    // -----------------------------------------------------------------------
    // Deterministic flex layout tests (divs only, no text)
    // -----------------------------------------------------------------------

    /// 3 fixed-size divs in a flex row with gap.
    #[test]
    fn test_flex_row_positions() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; flex-direction:row; gap:10px; width:300px; height:100px;">
    <div style="width:50px; height:50px;"></div>
    <div style="width:50px; height:50px;"></div>
    <div style="width:50px; height:50px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        // Find the three leaf rectangles (last 3 in DFS of the flex container subtree)
        // Tree: html > body > flex-container > [child0, child1, child2]
        // DFS order should have the 3 children at the end
        let leaf_layouts: Vec<_> = nodes
            .iter()
            .filter_map(|id| {
                let l = layouts.get(id)?;
                // Children are 50×50
                if (l.width - 50.0).abs() < 1.0 && (l.height - 50.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(leaf_layouts.len(), 3, "expected 3 leaf children");

        assert_eq!(leaf_layouts[0].x, 0.0, "child0 x");
        assert_eq!(leaf_layouts[1].x, 60.0, "child1 x = 50 + 10 gap");
        assert_eq!(leaf_layouts[2].x, 120.0, "child2 x = 50+10+50+10");
    }

    /// 3 fixed-size divs in a flex column with gap.
    #[test]
    fn test_flex_column_positions() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; flex-direction:column; gap:10px; width:100px; height:300px;">
    <div style="width:50px; height:50px;"></div>
    <div style="width:50px; height:50px;"></div>
    <div style="width:50px; height:50px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        let leaf_layouts: Vec<_> = nodes
            .iter()
            .filter_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 50.0).abs() < 1.0 && (l.height - 50.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(leaf_layouts.len(), 3, "expected 3 leaf children");

        assert_eq!(leaf_layouts[0].y, 0.0, "child0 y");
        assert_eq!(leaf_layouts[1].y, 60.0, "child1 y = 50 + 10 gap");
        assert_eq!(leaf_layouts[2].y, 120.0, "child2 y = 50+10+50+10");
    }

    /// justify-content: center with 2 fixed children.
    #[test]
    fn test_flex_justify_center() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; justify-content:center; width:200px; height:100px;">
    <div style="width:40px; height:40px;"></div>
    <div style="width:40px; height:40px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        let leaf_layouts: Vec<_> = nodes
            .iter()
            .filter_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 40.0).abs() < 1.0 && (l.height - 40.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(leaf_layouts.len(), 2, "expected 2 leaf children");

        // Total child width = 80, remaining = 120, offset = 60
        assert_eq!(leaf_layouts[0].x, 60.0, "child0 x centered");
        assert_eq!(leaf_layouts[1].x, 100.0, "child1 x centered");
    }

    /// justify-content: space-between with 3 fixed children.
    #[test]
    fn test_flex_justify_space_between() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; justify-content:space-between; width:200px; height:100px;">
    <div style="width:40px; height:40px;"></div>
    <div style="width:40px; height:40px;"></div>
    <div style="width:40px; height:40px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        let leaf_layouts: Vec<_> = nodes
            .iter()
            .filter_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 40.0).abs() < 1.0 && (l.height - 40.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(leaf_layouts.len(), 3, "expected 3 leaf children");

        assert_eq!(leaf_layouts[0].x, 0.0, "first child at start");
        assert_eq!(leaf_layouts[2].x, 160.0, "last child at end (200-40)");
    }

    /// align-items: center with a single child shorter than container.
    #[test]
    fn test_flex_align_center() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; align-items:center; width:200px; height:100px;">
    <div style="width:40px; height:40px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        let leaf = nodes
            .iter()
            .find_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 40.0).abs() < 1.0 && (l.height - 40.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .expect("should find 40×40 child");

        assert_eq!(leaf.y, 30.0, "child centered: (100-40)/2 = 30");
    }

    /// flex-grow: second child fills remaining space.
    #[test]
    fn test_flex_grow() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; width:300px; height:100px;">
    <div style="width:100px; height:50px;"></div>
    <div style="flex-grow:1; height:50px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        let child_layouts: Vec<_> = nodes
            .iter()
            .filter_map(|id| {
                let l = layouts.get(id)?;
                if (l.height - 50.0).abs() < 1.0 && l.width > 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(child_layouts.len(), 2, "expected 2 children");

        assert_eq!(child_layouts[0].width, 100.0, "first child fixed 100px");
        assert_eq!(child_layouts[0].x, 0.0, "first child at x=0");
        assert_eq!(
            child_layouts[1].width, 200.0,
            "second child grows to fill 300-100=200"
        );
        assert_eq!(child_layouts[1].x, 100.0, "second child starts after first");
    }

    /// Container padding offsets children.
    #[test]
    fn test_flex_padding() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; padding:10px; width:200px; height:100px;">
    <div style="width:30px; height:30px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        let leaf = nodes
            .iter()
            .find_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 30.0).abs() < 1.0 && (l.height - 30.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .expect("should find 30×30 child");

        assert_eq!(leaf.x, 10.0, "child offset by left padding");
        assert_eq!(leaf.y, 10.0, "child offset by top padding");
    }

    /// Flex column gap direction is correct (gap applies vertically).
    #[test]
    fn test_flex_gap_column_direction() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; flex-direction:column; gap:15px; width:100px; height:300px;">
    <div style="width:40px; height:40px;"></div>
    <div style="width:40px; height:40px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        let leaf_layouts: Vec<_> = nodes
            .iter()
            .filter_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 40.0).abs() < 1.0 && (l.height - 40.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(leaf_layouts.len(), 2, "expected 2 leaf children");

        assert_eq!(leaf_layouts[0].y, 0.0, "child0 at y=0");
        assert_eq!(leaf_layouts[1].y, 55.0, "child1 at y=40+15 gap");
    }

    /// Nested flex: outer row, inner column with children.
    #[test]
    fn test_nested_flex() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; flex-direction:row; width:400px; height:200px;">
    <div style="display:flex; flex-direction:column; width:100px; height:200px;">
      <div style="width:80px; height:60px;"></div>
      <div style="width:80px; height:60px;"></div>
    </div>
    <div style="width:100px; height:100px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        // Find the 80×60 leaves (inner column children)
        let inner_leaves: Vec<_> = nodes
            .iter()
            .filter_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 80.0).abs() < 1.0 && (l.height - 60.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(inner_leaves.len(), 2, "expected 2 inner column children");
        assert_eq!(inner_leaves[0].y, 0.0, "first inner child at y=0");
        assert_eq!(inner_leaves[1].y, 60.0, "second inner child at y=60");

        // Find the 100×100 sibling in the outer row
        let sibling = nodes
            .iter()
            .find_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 100.0).abs() < 1.0 && (l.height - 100.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .expect("should find 100×100 sibling");
        assert_eq!(
            sibling.x, 100.0,
            "sibling starts after inner column (width=100)"
        );
    }

    /// Explicit width/height dimensions are preserved.
    #[test]
    fn test_explicit_dimensions() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="width:200px; height:100px;"></div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        let leaf = nodes
            .iter()
            .find_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 200.0).abs() < 1.0 && (l.height - 100.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .expect("should find 200×100 div");

        assert_eq!(leaf.width, 200.0);
        assert_eq!(leaf.height, 100.0);
    }

    /// flex-wrap: children that overflow wrap to the next line.
    #[test]
    fn test_flex_wrap() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; flex-wrap:wrap; width:150px; height:200px;">
    <div style="width:60px; height:60px;"></div>
    <div style="width:60px; height:60px;"></div>
    <div style="width:60px; height:60px;"></div>
  </div>
</body></html>"#;
        let (scene, layouts) = html_layout(html, 800.0, 600.0);
        let nodes = dfs_nodes(&scene.graph);

        let leaf_layouts: Vec<_> = nodes
            .iter()
            .filter_map(|id| {
                let l = layouts.get(id)?;
                if (l.width - 60.0).abs() < 1.0 && (l.height - 60.0).abs() < 1.0 {
                    Some(*l)
                } else {
                    None
                }
            })
            .collect();
        assert_eq!(leaf_layouts.len(), 3, "expected 3 children");

        // First two fit on first row (60+60=120 <= 150)
        assert_eq!(leaf_layouts[0].y, 0.0, "child0 on first row");
        assert_eq!(leaf_layouts[1].y, 0.0, "child1 on first row");
        // Third wraps to second row
        assert!(
            leaf_layouts[2].y >= 60.0,
            "child2 should wrap to y >= 60, got {}",
            leaf_layouts[2].y
        );
    }

    // -----------------------------------------------------------------------
    // Effects / blend mode tests
    // -----------------------------------------------------------------------

    /// Parse HTML without running layout — returns just the SceneGraph.
    fn html_graph(html: &str) -> SceneGraph {
        from_html_str(html).expect("HTML parse failed")
    }

    /// text-shadow maps to drop-shadow effects on the TextSpan node.
    #[test]
    fn test_text_shadow() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div><span style="text-shadow: 2px 3px 4px rgba(0,0,0,0.6);">Hello</span></div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        // Find the TextSpan node
        let text_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::TextSpan(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a TextSpan node");

        let effects = text_node.effects().expect("TextSpan should have effects");
        assert_eq!(effects.shadows.len(), 1, "one text-shadow");
        match &effects.shadows[0] {
            FilterShadowEffect::DropShadow(s) => {
                assert_eq!(s.dx, 2.0);
                assert_eq!(s.dy, 3.0);
                assert_eq!(s.blur, 4.0);
                assert_eq!(s.spread, 0.0, "text-shadow has no spread");
                assert!(s.active);
            }
            _ => panic!("expected DropShadow"),
        }
    }

    /// Multiple text-shadows produce multiple DropShadow effects.
    #[test]
    fn test_text_shadow_multiple() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div><span style="text-shadow: 1px 1px 2px black, 0 0 8px blue;">Multi</span></div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let text_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::TextSpan(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a TextSpan node");

        let effects = text_node.effects().expect("TextSpan should have effects");
        assert_eq!(effects.shadows.len(), 2, "two text-shadows");
    }

    /// box-shadow (inset + outer) maps to InnerShadow + DropShadow.
    #[test]
    fn test_box_shadow() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="width:100px; height:100px; box-shadow: 4px 4px 8px black, inset 2px 2px 4px red;"></div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let rect_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::Rectangle(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a Rectangle node");

        let effects = rect_node.effects().expect("Rectangle should have effects");
        assert_eq!(effects.shadows.len(), 2, "two box-shadows");
        assert!(
            matches!(&effects.shadows[0], FilterShadowEffect::DropShadow(_)),
            "first is DropShadow"
        );
        assert!(
            matches!(&effects.shadows[1], FilterShadowEffect::InnerShadow(_)),
            "second is InnerShadow"
        );
    }

    /// filter: blur() maps to FeLayerBlur on a rectangle.
    #[test]
    fn test_filter_blur() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="width:100px; height:100px; filter: blur(6px);"></div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let rect_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::Rectangle(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a Rectangle node");

        let effects = rect_node.effects().expect("Rectangle should have effects");
        let blur = effects.blur.as_ref().expect("should have blur");
        match &blur.blur {
            FeBlur::Gaussian(g) => assert_eq!(g.radius, 6.0),
            _ => panic!("expected Gaussian blur"),
        }
    }

    /// filter: drop-shadow() maps to DropShadow effect on a rectangle.
    #[test]
    fn test_filter_drop_shadow() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="width:100px; height:100px; filter: drop-shadow(4px 4px 8px black);"></div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let rect_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::Rectangle(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a Rectangle node");

        let effects = rect_node.effects().expect("Rectangle should have effects");
        assert_eq!(effects.shadows.len(), 1, "one drop-shadow from filter");
        match &effects.shadows[0] {
            FilterShadowEffect::DropShadow(s) => {
                assert_eq!(s.dx, 4.0);
                assert_eq!(s.dy, 4.0);
                assert_eq!(s.blur, 8.0);
            }
            _ => panic!("expected DropShadow"),
        }
    }

    /// backdrop-filter: blur() maps to FeBackdropBlur.
    ///
    /// NOTE: Stylo marks `backdrop-filter` as `servo_pref="layout.unimplemented"`,
    /// so in servo mode the property is parsed but treated as initial (none).
    /// The mapping code is correct but untestable until a gecko build or pref
    /// override is available. This test verifies the pipeline doesn't crash.
    #[test]
    fn test_backdrop_filter_blur() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="width:200px; height:200px;">
    <div style="width:100px; height:100px; backdrop-filter: blur(12px);"></div>
  </div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let rect_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::Rectangle(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a Rectangle node");

        // backdrop-filter is unimplemented in servo mode so effects may lack backdrop_blur.
        // Just verify the node exists and effects are accessible (no crash).
        let _effects = rect_node.effects().expect("Rectangle should have effects");
    }

    /// mix-blend-mode: multiply maps to LayerBlendMode::Blend(BlendMode::Multiply).
    #[test]
    fn test_mix_blend_mode() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="width:100px; height:100px; mix-blend-mode: multiply;"></div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let rect_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::Rectangle(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a Rectangle node");

        assert_eq!(
            rect_node.blend_mode(),
            LayerBlendMode::Blend(BlendMode::Multiply)
        );
    }

    /// mix-blend-mode: normal stays as PassThrough (default).
    #[test]
    fn test_mix_blend_mode_normal() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="width:100px; height:100px; mix-blend-mode: normal;"></div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let rect_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::Rectangle(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a Rectangle node");

        assert_eq!(rect_node.blend_mode(), LayerBlendMode::PassThrough);
    }

    /// Effects on containers: filter + blend mode on a flex container.
    #[test]
    fn test_container_effects() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="display:flex; width:200px; height:100px; filter: blur(4px); mix-blend-mode: screen;">
    <div style="width:50px; height:50px;"></div>
  </div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        // Find the container with non-PassThrough blend mode (the one with mix-blend-mode: screen)
        let container_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::Container(_)) && n.blend_mode() != LayerBlendMode::PassThrough
                {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a Container with non-default blend mode");

        let effects = container_node
            .effects()
            .expect("Container should have effects");
        assert!(effects.blur.is_some(), "container should have blur");
        assert_eq!(
            container_node.blend_mode(),
            LayerBlendMode::Blend(BlendMode::Screen)
        );
    }

    // -----------------------------------------------------------------------
    // Text decoration (color, style) tests
    // -----------------------------------------------------------------------

    /// text-decoration-color maps to TextDecorationRec.text_decoration_color.
    #[test]
    fn test_text_decoration_color() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="text-decoration: underline; text-decoration-color: #ef4444;">Red underline</div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let text_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::TextSpan(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a TextSpan node");

        if let Node::TextSpan(ts) = text_node {
            let dec = ts
                .text_style
                .text_decoration
                .as_ref()
                .expect("should have decoration");
            assert_eq!(dec.text_decoration_line, TextDecorationLine::Underline);
            let color = dec
                .text_decoration_color
                .expect("should have decoration color");
            assert_eq!(color, CGColor::from_rgba(239, 68, 68, 255));
        } else {
            panic!("expected TextSpan");
        }
    }

    /// text-decoration-style maps to TextDecorationRec.text_decoration_style.
    #[test]
    fn test_text_decoration_style() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="text-decoration: underline; text-decoration-style: wavy;">Wavy</div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let text_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::TextSpan(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a TextSpan node");

        if let Node::TextSpan(ts) = text_node {
            let dec = ts
                .text_style
                .text_decoration
                .as_ref()
                .expect("should have decoration");
            assert_eq!(dec.text_decoration_style, Some(TextDecorationStyle::Wavy));
        } else {
            panic!("expected TextSpan");
        }
    }

    /// Combined: text-decoration with color + style + line.
    #[test]
    fn test_text_decoration_combined() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body>
  <div style="text-decoration: line-through; text-decoration-color: #3b82f6; text-decoration-style: dashed;">Combo</div>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let text_node = nodes
            .iter()
            .find_map(|id| {
                let n = graph.get_node(id).ok()?;
                if matches!(n, Node::TextSpan(_)) {
                    Some(n)
                } else {
                    None
                }
            })
            .expect("should find a TextSpan node");

        if let Node::TextSpan(ts) = text_node {
            let dec = ts
                .text_style
                .text_decoration
                .as_ref()
                .expect("should have decoration");
            assert_eq!(dec.text_decoration_line, TextDecorationLine::LineThrough);
            assert_eq!(
                dec.text_decoration_color,
                Some(CGColor::from_rgba(59, 130, 246, 255))
            );
            assert_eq!(dec.text_decoration_style, Some(TextDecorationStyle::Dashed));
            assert_eq!(
                dec.text_decoration_thickness, None,
                "thickness unavailable in servo mode"
            );
        } else {
            panic!("expected TextSpan");
        }
    }

    /// h1 margin should merge into padding (no extra wrapper container).
    #[test]
    fn test_h1_margin_no_double_wrap() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body style="margin:0; padding:0;">
  <h1>Hello</h1>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        // h1 has UA margin ~21px top/bottom. With body margin:0, the tree should be:
        //   ICB → html → h1(margin merged as padding) → TextSpan
        // Total containers: 3 (ICB + html + h1), no extra wrapper.
        let container_count = nodes
            .iter()
            .filter(|id| matches!(graph.get_node(id).ok(), Some(Node::Container(_))))
            .count();
        // ICB is InitialContainer, not Container
        let icb_count = nodes
            .iter()
            .filter(|id| matches!(graph.get_node(id).ok(), Some(Node::InitialContainer(_))))
            .count();
        assert_eq!(
            icb_count + container_count,
            3,
            "ICB + html + h1 = 3 frames, no margin wrapper"
        );

        // h1 container should have margin merged as padding
        let h1_node = nodes
            .iter()
            .rev()
            .find_map(|id| match graph.get_node(id).ok()? {
                Node::Container(c) if c.layout_container.layout_padding.is_some() => {
                    Some(c.layout_container.layout_padding.as_ref().unwrap().clone())
                }
                _ => None,
            })
            .expect("h1 should have padding from merged margin");
        assert!(
            h1_node.top > 10.0,
            "h1 should have top padding from UA margin"
        );
        assert!(
            h1_node.bottom > 10.0,
            "h1 should have bottom padding from UA margin"
        );
    }

    /// Inline elements (<strong>, <em>, <code>) should merge into a single AttributedText.
    #[test]
    fn test_inline_elements_merge_to_attributed_text() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body style="margin:0;">
  <p>Hello <strong>world</strong>!</p>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        // Find the AttributedText node
        let attr_node = nodes
            .iter()
            .find_map(|id| match graph.get_node(id).ok()? {
                Node::AttributedText(n) => Some(n),
                _ => None,
            })
            .expect("should produce an AttributedText node");

        // Full text should be the concatenation of all inline segments
        assert!(
            attr_node.attributed_string.text.contains("Hello"),
            "text should contain 'Hello'"
        );
        assert!(
            attr_node.attributed_string.text.contains("world"),
            "text should contain 'world'"
        );

        // Should have multiple runs (at least: normal + bold + normal)
        assert!(
            attr_node.attributed_string.runs.len() >= 2,
            "should have at least 2 styled runs, got {}",
            attr_node.attributed_string.runs.len()
        );

        // The "world" run should be bold (font-weight >= 700)
        let bold_run = attr_node
            .attributed_string
            .runs
            .iter()
            .find(|r| {
                let text = &attr_node.attributed_string.text[r.start as usize..r.end as usize];
                text.contains("world")
            })
            .expect("should find a run containing 'world'");
        assert!(
            bold_run.style.font_weight.0 >= 700,
            "bold run should have weight >= 700, got {}",
            bold_run.style.font_weight.0
        );

        // There should be NO separate TextSpan nodes (everything merged)
        let text_span_count = nodes
            .iter()
            .filter(|id| matches!(graph.get_node(id).ok(), Some(Node::TextSpan(_))))
            .count();
        assert_eq!(text_span_count, 0, "no separate TextSpan nodes expected");
    }

    /// Whitespace between inline elements must be preserved.
    #[test]
    fn test_inline_whitespace_preserved() {
        let _guard = lock_html();
        let html = r#"<!doctype html>
<html><body style="margin:0;">
  <p>Default <span style="color: red;">red</span> and <span style="color: green;">green</span> text.</p>
</body></html>"#;
        let graph = html_graph(html);
        let nodes = dfs_nodes(&graph);

        let attr_node = nodes.iter().find_map(|id| {
            match graph.get_node(id).ok()? {
                Node::AttributedText(n) => Some(n),
                _ => None,
            }
        }).expect("should produce an AttributedText node");

        let text = &attr_node.attributed_string.text;
        assert!(
            text.contains("Default "),
            "should preserve space after 'Default', got: {:?}",
            text
        );
        assert!(
            text.contains(" and "),
            "should preserve spaces around 'and', got: {:?}",
            text
        );
        assert!(
            text.contains(" text."),
            "should preserve space before 'text.', got: {:?}",
            text
        );
    }
}
