//! Phase 1: Walk Stylo-styled DOM → `StyledElement` tree.
//!
//! Extracts resolved CSS properties from `ComputedValues` into plain Rust
//! structs. **No Skia objects are created here** — Stylo's global DOM slot
//! corrupts Skia objects built while `borrow_data()` borrows are active.

use crate::cg::prelude::*;
// Re-import our own GradientStop over cg's
use super::style::GradientStop;

use csscascade::adapter::{self, HtmlElement};
use csscascade::dom::{DemoDom, DemoNode, DemoNodeData};

use style::color::{AbsoluteColor, ColorSpace};
use style::dom::TElement;
use style::properties::ComputedValues;
use style::values::generics::font::LineHeight as StyloLineHeight;
use style::values::generics::length::GenericSize;
use style::values::specified::text::TextDecorationLine as StyloTextDecorationLine;

use super::style::*;
use super::types;
use super::types::{CssLength, LineHeight, WhiteSpace};

/// Parse HTML, resolve CSS via Stylo, and build a `StyledElement` tree.
///
/// The UA stylesheet is handled by `csscascade::CascadeDriver` — it
/// registers a compact Chromium-derived UA sheet at `Origin::UserAgent`
/// so elements receive browser-default styles automatically.
pub fn collect_styled_tree(html: &str) -> Result<Option<StyledElement>, String> {
    use csscascade::cascade::CascadeDriver;
    use style::thread_state::{self, ThreadState};

    thread_state::initialize(ThreadState::LAYOUT);

    // Enable CSS Grid support in Stylo's servo mode (one-time).
    // Without this, `display: grid` is not parsed (gated behind a pref).
    use std::sync::Once;
    static GRID_PREF: Once = Once::new();
    GRID_PREF.call_once(|| style_config::set_bool("layout.grid.enabled", true));

    let dom =
        DemoDom::parse_from_bytes(html.as_bytes()).map_err(|e| format!("HTML parse error: {e}"))?;
    let mut driver = CascadeDriver::new(&dom);
    let document = adapter::bootstrap_dom(dom);
    driver.flush(document);
    let _styled_count = driver.style_document(document);

    let root = document.root_element().map(collect_element);
    Ok(root)
}

// ─── Element collection ──────────────────────────────────────────────

/// Ordinal counter state for ordered lists.
/// Mirrors Chromium's `ListItemOrdinal` which tracks per-item values.
struct ListCounter {
    value: i32,
}

/// Generate marker text for a list item.
///
/// Mirrors Chromium's `ListMarker::MarkerText()` which uses `CounterStyle`
/// to produce the prefix (bullet character or formatted number).
fn generate_marker_text<T: std::fmt::Debug>(lst: &T, ordinal: i32) -> Option<String> {
    // Stylo's ListStyleType wraps the property enum.
    // Use debug format to identify the type since the enum may be generated.
    // Stylo's servo-mode ListStyleType is a keyword enum.
    // Use Debug format to match variants since the type is generated.
    //
    // Supported by Stylo (servo): disc, none, circle, square, decimal,
    // lower-alpha, upper-alpha, disclosure-open, disclosure-closed, and
    // various CJK/Indic scripts.
    //
    // NOT supported by Stylo (servo): lower-roman, upper-roman.
    // These parse as invalid and fall back to `disc`.
    let debug = format!("{:?}", lst);

    if debug.contains("None") {
        return None;
    }

    // Symbol markers (Chromium: ListStyleCategory::kSymbol)
    if debug.contains("Disc") {
        return Some("\u{2022} ".to_string()); // •
    }
    if debug.contains("Circle") {
        return Some("\u{25E6} ".to_string()); // ◦
    }
    if debug.contains("Square") {
        return Some("\u{25AA} ".to_string()); // ▪
    }

    // Ordinal markers (Chromium: ListStyleCategory::kLanguage)
    if debug.contains("Decimal") {
        return Some(format!("{}. ", ordinal));
    }
    if debug.contains("LowerAlpha") {
        if (1..=26).contains(&ordinal) {
            let ch = (b'a' + (ordinal - 1) as u8) as char;
            return Some(format!("{}. ", ch));
        }
        return Some(format!("{}. ", ordinal));
    }
    if debug.contains("UpperAlpha") {
        if (1..=26).contains(&ordinal) {
            let ch = (b'A' + (ordinal - 1) as u8) as char;
            return Some(format!("{}. ", ch));
        }
        return Some(format!("{}. ", ordinal));
    }
    if debug.contains("LowerRoman") {
        return Some(format!("{}. ", to_roman(ordinal).to_lowercase()));
    }
    if debug.contains("UpperRoman") {
        return Some(format!("{}. ", to_roman(ordinal)));
    }

    // Default fallback: disc bullet
    Some("\u{2022} ".to_string())
}

/// Convert an integer to Roman numeral string.
fn to_roman(mut n: i32) -> String {
    if n <= 0 {
        return n.to_string();
    }
    let values = [
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    ];
    let mut result = String::new();
    for &(val, sym) in &values {
        while n >= val {
            result.push_str(sym);
            n -= val;
        }
    }
    result
}

// ─── HTML attribute helpers ─────────────────────────────────────────

/// Get an HTML attribute value from a DOM node.
fn get_element_attr(node: &DemoNode, name: &str) -> Option<String> {
    match &node.data {
        DemoNodeData::Element(data) => data
            .attrs
            .iter()
            .find(|a| a.name.local.as_ref().eq_ignore_ascii_case(name))
            .map(|a| a.value.to_string()),
        _ => None,
    }
}

/// Check if an HTML attribute is present (boolean attribute like `checked`, `disabled`).
fn has_element_attr(node: &DemoNode, name: &str) -> bool {
    get_element_attr(node, name).is_some()
}

/// Collect the concatenated text content of a DOM node's children (shallow).
fn collect_text_content(dom: &DemoDom, node: &DemoNode) -> String {
    let mut text = String::new();
    for child_id in &node.children {
        if let DemoNodeData::Text(t) = &dom.node(*child_id).data {
            text.push_str(t);
        }
    }
    text
}

fn collect_element(element: HtmlElement) -> StyledElement {
    collect_element_with_counter(element, &mut None)
}

fn collect_element_with_counter(
    element: HtmlElement,
    list_counter: &mut Option<ListCounter>,
) -> StyledElement {
    let tag = element.local_name_string();

    let data = element.borrow_data();
    let style = data
        .as_ref()
        .map(|d| d.styles.primary().clone())
        .unwrap_or_else(|| panic!("Element {tag} has no style data"));

    let mut el = extract_style(&tag, &style);

    // Strip root element margins
    if tag == "html" || tag == "body" {
        el.margin = CssEdgeInsets {
            top: CssLength::Px(0.0),
            right: CssLength::Px(0.0),
            bottom: CssLength::Px(0.0),
            left: CssLength::Px(0.0),
        };
    }

    // List marker generation (Chromium: ::marker pseudo-element)
    // For display:list-item, generate marker text and prepend to content.
    let display = style.clone_display();
    let is_list_item = display.is_list_item();

    // Initialize counter for <ol>/<ul> elements
    let mut child_counter: Option<ListCounter> = if tag == "ol" {
        // Check for start attribute via Stylo — defaults to 1
        // Stylo doesn't expose HTML attributes directly, but the UA stylesheet
        // + author CSS handle `counter-reset`. We default to 1.
        Some(ListCounter { value: 1 })
    } else if tag == "ul" || tag == "menu" {
        Some(ListCounter { value: 0 }) // unordered, counter not used for numbering
    } else {
        None
    };

    // Use parent's counter if this is a list item
    let marker_prefix = if is_list_item {
        let list_style = style.get_list();
        let lst = list_style.clone_list_style_type();

        // Get ordinal from parent counter
        let ordinal = if let Some(ref mut counter) = list_counter {
            let val = counter.value;
            counter.value += 1;
            val
        } else {
            1
        };

        generate_marker_text(&lst, ordinal)
    } else {
        None
    };

    // ── Widget detection (form controls) ──
    let dom = adapter::dom();
    let node_data = dom.node(element.node_id());

    let is_void_widget = detect_widget(&tag, node_data, dom, &mut el);

    // Collect children, merging consecutive inline content into InlineGroups
    let mut pending_inline: Vec<InlineRunItem> = Vec::new();
    let parent_text_align = el.font.text_align;
    let parent_font = el.font.clone();
    let parent_color = el.color;
    let parent_white_space = el.font.white_space;

    // Inject list marker as first inline content (Chromium: ::marker pseudo-element)
    if let Some(marker) = marker_prefix {
        pending_inline.push(InlineRunItem::Text(TextRun {
            text: marker,
            font: parent_font.clone(),
            color: parent_color,
            decoration: None,
        }));
    }

    // Void widget elements (<input>) have no DOM children to collect.
    if !is_void_widget {
        for child_id in &node_data.children {
            let child_node = dom.node(*child_id);
            match &child_node.data {
                DemoNodeData::Text(text) => {
                    let processed = process_whitespace(text, parent_white_space);
                    if !processed.is_empty() {
                        pending_inline.push(InlineRunItem::Text(TextRun {
                            text: processed,
                            font: parent_font.clone(),
                            color: parent_color,
                            decoration: None,
                        }));
                    }
                }
                DemoNodeData::Element(_) => {
                    let child_el = HtmlElement::from_node_id(*child_id);
                    let child = collect_element_with_counter(child_el, &mut child_counter);
                    if child.display == types::Display::None {
                        continue;
                    }

                    // Widgets with intrinsic sizes need their own Taffy node
                    // for sizing to work — don't flatten them into inline groups.
                    let is_inline = child.display == types::Display::Inline
                        || child.display == types::Display::InlineBlock;
                    if is_inline && !child.widget.is_widget() {
                        collect_inline_items(&child, &mut pending_inline);
                    } else {
                        flush_inline_group(
                            &mut pending_inline,
                            parent_text_align,
                            &mut el.children,
                        );
                        el.children.push(StyledNode::Element(child));
                    }
                }
                _ => {}
            }
        }
    }

    // Flush any trailing inline content
    flush_inline_group(&mut pending_inline, parent_text_align, &mut el.children);

    el
}

// ─── Widget (form control) detection ────────────────────────────────

/// Chromium placeholder color (#757575).
const PLACEHOLDER_COLOR: CGColor = CGColor {
    r: 117,
    g: 117,
    b: 117,
    a: 255,
};

/// Detect form control elements and populate `StyledElement::widget`.
///
/// Returns `true` for void elements (like `<input>`) whose DOM children
/// should be skipped.
fn detect_widget(tag: &str, node_data: &DemoNode, dom: &DemoDom, el: &mut StyledElement) -> bool {
    match tag {
        "input" => {
            detect_input_widget(node_data, el);
            true // <input> is a void element
        }
        "textarea" => {
            detect_textarea_widget(node_data, dom, el);
            true // skip text children — value already injected
        }
        "select" => {
            detect_select_widget(node_data, dom, el);
            true // skip <option> children — selected text already injected
        }
        "button" => {
            let disabled = has_element_attr(node_data, "disabled");
            el.widget = WidgetAppearance::PushButton { disabled };
            if el.display == types::Display::Inline {
                el.display = types::Display::InlineBlock;
            }
            // Default button padding if UA didn't provide any
            apply_default_button_padding(el);
            false // <button> has normal DOM children
        }
        _ => false,
    }
}

fn detect_input_widget(node_data: &DemoNode, el: &mut StyledElement) {
    let input_type = get_element_attr(node_data, "type")
        .unwrap_or_else(|| "text".to_string())
        .to_ascii_lowercase();
    let disabled = has_element_attr(node_data, "disabled");

    if el.display == types::Display::Inline {
        el.display = types::Display::InlineBlock;
    }

    match input_type.as_str() {
        "checkbox" => {
            el.widget = WidgetAppearance::Checkbox {
                checked: has_element_attr(node_data, "checked"),
                disabled,
            };
        }
        "radio" => {
            el.widget = WidgetAppearance::Radio {
                checked: has_element_attr(node_data, "checked"),
                disabled,
            };
        }
        "range" => {
            let min = get_element_attr(node_data, "min")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.0);
            let max = get_element_attr(node_data, "max")
                .and_then(|v| v.parse().ok())
                .unwrap_or(100.0);
            let value = get_element_attr(node_data, "value")
                .and_then(|v| v.parse().ok())
                .unwrap_or((min + max) / 2.0);
            el.widget = WidgetAppearance::SliderHorizontal {
                min,
                max,
                value,
                disabled,
            };
        }
        "color" => {
            let hex = get_element_attr(node_data, "value").unwrap_or_else(|| "#000000".into());
            let color = parse_hex_color(&hex).unwrap_or(CGColor::BLACK);
            el.widget = WidgetAppearance::ColorWell {
                value: color,
                disabled,
            };
        }
        "submit" | "reset" | "button" => {
            let label =
                get_element_attr(node_data, "value").or_else(|| match input_type.as_str() {
                    "submit" => Some("Submit".into()),
                    "reset" => Some("Reset".into()),
                    _ => None,
                });
            el.widget = WidgetAppearance::PushButton { disabled };
            apply_default_button_padding(el);
            if let Some(text) = label {
                inject_synthetic_text(el, &text, el.color);
            }
        }
        "hidden" => {
            el.display = types::Display::None;
        }
        _ => {
            let text_type = match input_type.as_str() {
                "password" => TextFieldType::Password,
                "email" => TextFieldType::Email,
                "search" => TextFieldType::Search,
                "url" => TextFieldType::Url,
                "tel" => TextFieldType::Tel,
                "number" => TextFieldType::Number,
                _ => TextFieldType::Text,
            };
            let placeholder = get_element_attr(node_data, "placeholder");
            let value = get_element_attr(node_data, "value");
            let size = get_element_attr(node_data, "size")
                .and_then(|v| v.parse().ok())
                .unwrap_or(20u32);

            let display_text = if let Some(ref v) = value {
                if text_type == TextFieldType::Password {
                    Some(("\u{2022}".repeat(v.len()), el.color))
                } else {
                    Some((v.clone(), el.color))
                }
            } else {
                placeholder.as_ref().map(|p| (p.clone(), PLACEHOLDER_COLOR))
            };

            if let Some((text, color)) = display_text {
                inject_synthetic_text(el, &text, color);
            }

            el.widget = WidgetAppearance::TextField {
                input_type: text_type,
                placeholder,
                value,
                size,
                disabled,
            };
            apply_default_text_control_padding(el);
        }
    }
}

fn detect_textarea_widget(node_data: &DemoNode, dom: &DemoDom, el: &mut StyledElement) {
    let placeholder = get_element_attr(node_data, "placeholder");
    let disabled = has_element_attr(node_data, "disabled");
    let rows = get_element_attr(node_data, "rows")
        .and_then(|v| v.parse().ok())
        .unwrap_or(2u32);
    let cols = get_element_attr(node_data, "cols")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20u32);

    let text_content = collect_text_content(dom, node_data);
    let value = if text_content.trim().is_empty() {
        None
    } else {
        Some(text_content)
    };

    let display_text = if let Some(ref v) = value {
        Some((v.clone(), el.color))
    } else {
        placeholder.as_ref().map(|p| (p.clone(), PLACEHOLDER_COLOR))
    };

    if let Some((text, color)) = display_text {
        inject_synthetic_text(el, &text, color);
    }

    if el.display == types::Display::Inline {
        el.display = types::Display::InlineBlock;
    }

    el.widget = WidgetAppearance::TextArea {
        placeholder,
        value,
        rows,
        cols,
        disabled,
    };
    apply_default_text_control_padding(el);
}

fn detect_select_widget(node_data: &DemoNode, dom: &DemoDom, el: &mut StyledElement) {
    let disabled = has_element_attr(node_data, "disabled");
    let mut selected_text: Option<String> = None;
    let mut first_option_text: Option<String> = None;

    for child_id in &node_data.children {
        let child_node = dom.node(*child_id);
        if let DemoNodeData::Element(data) = &child_node.data {
            let local = data.name.local.as_ref();
            if local.eq_ignore_ascii_case("option") {
                let text = collect_text_content(dom, child_node).trim().to_string();
                if first_option_text.is_none() && !text.is_empty() {
                    first_option_text = Some(text.clone());
                }
                let is_selected = data
                    .attrs
                    .iter()
                    .any(|a| a.name.local.as_ref().eq_ignore_ascii_case("selected"));
                if is_selected && !text.is_empty() {
                    selected_text = Some(text);
                    break;
                }
            }
            if local.eq_ignore_ascii_case("optgroup") {
                for gc_id in &child_node.children {
                    let gc = dom.node(*gc_id);
                    if let DemoNodeData::Element(gc_data) = &gc.data {
                        if gc_data.name.local.as_ref().eq_ignore_ascii_case("option") {
                            let text = collect_text_content(dom, gc).trim().to_string();
                            if first_option_text.is_none() && !text.is_empty() {
                                first_option_text = Some(text.clone());
                            }
                            let is_selected = gc_data
                                .attrs
                                .iter()
                                .any(|a| a.name.local.as_ref().eq_ignore_ascii_case("selected"));
                            if is_selected && !text.is_empty() {
                                selected_text = Some(text);
                                break;
                            }
                        }
                    }
                }
                if selected_text.is_some() {
                    break;
                }
            }
        }
    }

    let display_text = selected_text.clone().or(first_option_text);
    if let Some(ref text) = display_text {
        inject_synthetic_text(el, text, el.color);
    }

    if el.display == types::Display::Inline {
        el.display = types::Display::InlineBlock;
    }

    el.widget = WidgetAppearance::Menulist {
        selected_text: display_text,
        disabled,
    };
    apply_default_text_control_padding(el);
}

/// Inject synthetic text content into a styled element as an InlineGroup child.
/// Apply default button padding when UA stylesheet didn't provide any.
/// Chromium default: ~6px 16px (block, inline).
fn apply_default_button_padding(el: &mut StyledElement) {
    let has_padding = el.padding.top > 0.0
        || el.padding.right > 0.0
        || el.padding.bottom > 0.0
        || el.padding.left > 0.0;
    if !has_padding {
        el.padding = EdgeInsets {
            top: 4.0,
            right: 16.0,
            bottom: 4.0,
            left: 16.0,
        };
    }
}

/// Apply default text control padding when UA stylesheet didn't provide any.
/// Chromium default: ~1px 2px.
fn apply_default_text_control_padding(el: &mut StyledElement) {
    let has_padding = el.padding.top > 0.0
        || el.padding.right > 0.0
        || el.padding.bottom > 0.0
        || el.padding.left > 0.0;
    if !has_padding {
        el.padding = EdgeInsets {
            top: 2.0,
            right: 4.0,
            bottom: 2.0,
            left: 4.0,
        };
    }
}

fn inject_synthetic_text(el: &mut StyledElement, text: &str, color: CGColor) {
    el.children.push(StyledNode::InlineGroup(InlineGroup {
        items: vec![InlineRunItem::Text(TextRun {
            text: text.to_string(),
            font: el.font.clone(),
            color,
            decoration: None,
        })],
        text_align: el.font.text_align,
    }));
}

/// Parse a `#RRGGBB` hex color string.
fn parse_hex_color(hex: &str) -> Option<CGColor> {
    let hex = hex.strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
    Some(CGColor { r, g, b, a: 255 })
}

/// Recursively flatten an inline element's content into text runs.
/// Collect inline items from an inline element, mirroring Chromium's
/// `InlineItemsBuilder` which flattens the DOM tree into a sequence of
/// `kOpenTag`, `kText`, `kCloseTag` items.
fn collect_inline_items(el: &StyledElement, items: &mut Vec<InlineRunItem>) {
    let deco = build_inline_decoration(el);

    // Chromium: HandleOpenTag() — emit inline-start spacing
    if let Some(ref d) = deco {
        let inline_start = d.padding_inline + d.border.map_or(0.0, |b| b.width);
        items.push(InlineRunItem::OpenBox {
            inline_size: inline_start,
            decoration: d.clone(),
        });
    }

    for child in &el.children {
        match child {
            StyledNode::Text(run) => {
                items.push(InlineRunItem::Text(TextRun {
                    text: run.text.clone(),
                    font: el.font.clone(),
                    color: el.color,
                    decoration: None, // decoration is on the OpenBox/CloseBox, not the text
                }));
            }
            StyledNode::Element(child_el) => {
                collect_inline_items(child_el, items);
            }
            StyledNode::InlineGroup(group) => {
                // Preserve child run styling — don't overwrite with parent's
                // font/color. Nested inline elements (e.g. <strong><em>text</em></strong>)
                // need to keep each run's specific styling intact.
                for item in &group.items {
                    items.push(item.clone());
                }
            }
        }
    }

    // Chromium: HandleCloseTag() — emit inline-end spacing
    if let Some(ref d) = deco {
        let inline_end = d.padding_inline + d.border.map_or(0.0, |b| b.width);
        items.push(InlineRunItem::CloseBox {
            inline_size: inline_end,
        });
    }
}

/// Build an `InlineBoxDecoration` from an inline element's CSS properties.
///
/// Mirrors Chromium's `ComputeOpenTagResult()` in `LineBreaker` which checks
/// `style.HasBorder() || style.MayHavePadding() || style.MayHaveMargin()`
/// for any inline element. This is purely CSS-driven — not tag-specific.
///
/// Returns `None` if the element has no visual box decoration.
fn build_inline_decoration(el: &StyledElement) -> Option<InlineBoxDecoration> {
    let bg = el.background.first().and_then(|l| match l {
        BackgroundLayer::Solid(c) if c.a > 0 => Some(*c),
        _ => None,
    });

    // Chromium: ComputeBordersForInline() — check if any border side has width > 0
    let has_border = el.border.top.width > 0.0
        || el.border.right.width > 0.0
        || el.border.bottom.width > 0.0
        || el.border.left.width > 0.0;

    // Simplified to uniform border (CSS inline borders are typically uniform
    // for <code>, <kbd> etc.)
    let border = if has_border {
        let side = if el.border.top.width > 0.0 {
            el.border.top
        } else if el.border.left.width > 0.0 {
            el.border.left
        } else if el.border.bottom.width > 0.0 {
            el.border.bottom
        } else {
            el.border.right
        };
        Some(side)
    } else {
        None
    };

    let radius = el.border_radius.max_radius();

    // Chromium: ComputeLinePadding() → inline/block axis padding
    let padding_inline = el.padding.left.max(el.padding.right);
    let padding_block = el.padding.top.max(el.padding.bottom);

    // Chromium: style.HasBorder() || style.MayHavePadding()
    // (we skip margin check — inline margins are rare and not yet supported)
    let has_decoration = bg.is_some()
        || border.is_some()
        || radius > 0.0
        || padding_inline > 0.0
        || padding_block > 0.0;

    if !has_decoration {
        return None;
    }

    Some(InlineBoxDecoration {
        background: bg,
        border,
        border_radius: radius,
        padding_inline,
        padding_block,
    })
}

/// Flush pending inline items into an InlineGroup node.
/// Drops groups that are whitespace-only (inter-element whitespace in block flow).
fn flush_inline_group(
    pending: &mut Vec<InlineRunItem>,
    text_align: TextAlign,
    children: &mut Vec<StyledNode>,
) {
    if pending.is_empty() {
        return;
    }
    let items = std::mem::take(pending);

    // Skip whitespace-only groups — these are inter-element whitespace
    // (e.g. "\n  " between <div> and <p>) that should not create a block.
    let all_whitespace = items.iter().all(|item| match item {
        InlineRunItem::Text(r) => r.text.trim().is_empty(),
        InlineRunItem::OpenBox { .. } | InlineRunItem::CloseBox { .. } => false,
    });
    if all_whitespace {
        return;
    }

    children.push(StyledNode::InlineGroup(InlineGroup { items, text_align }));
}

// ─── CSS property extraction ─────────────────────────────────────────

fn extract_style(tag: &str, style: &ComputedValues) -> StyledElement {
    let mut el = StyledElement {
        tag: tag.to_string(),
        ..StyledElement::default()
    };

    // Display
    let display = style.clone_display();
    el.display = if display.is_none() {
        types::Display::None
    } else {
        match (display.outside(), display.inside()) {
            (
                style::values::specified::box_::DisplayOutside::Inline,
                style::values::specified::box_::DisplayInside::Flow,
            ) => types::Display::Inline,
            (
                style::values::specified::box_::DisplayOutside::Inline,
                style::values::specified::box_::DisplayInside::FlowRoot,
            ) => types::Display::InlineBlock,
            (_, style::values::specified::box_::DisplayInside::Flex) => types::Display::Flex,
            (_, style::values::specified::box_::DisplayInside::Grid) => types::Display::Grid,
            (_, style::values::specified::box_::DisplayInside::Table) => types::Display::Table,
            (_, style::values::specified::box_::DisplayInside::TableRow) => {
                types::Display::TableRow
            }
            (_, style::values::specified::box_::DisplayInside::TableCell) => {
                types::Display::TableCell
            }
            _ => types::Display::Block,
        }
    };

    // Visibility
    {
        use style::properties::longhands::visibility::computed_value::T as StyloVis;
        el.visibility = match style.clone_visibility() {
            StyloVis::Visible => types::Visibility::Visible,
            StyloVis::Hidden => types::Visibility::Hidden,
            StyloVis::Collapse => types::Visibility::Collapse,
        };
    }

    // Opacity
    el.opacity = style.get_effects().opacity;

    // Overflow
    let bx = style.get_box();
    el.overflow_x = map_overflow(bx.overflow_x);
    el.overflow_y = map_overflow(bx.overflow_y);

    // Position
    {
        use style::properties::longhands::position::computed_value::T as StyloPos;
        let pos_val = bx.clone_position();
        el.position = if pos_val.is_absolutely_positioned() {
            types::Position::Absolute
        } else if pos_val == StyloPos::Relative {
            types::Position::Relative
        } else if pos_val == StyloPos::Fixed {
            types::Position::Fixed
        } else {
            types::Position::Static
        };
    }

    // Margin (may be auto or %)
    el.margin = extract_css_margin(style);

    // Padding (resolved to px)
    el.padding = extract_padding(style);

    // Border
    el.border = extract_border(style);

    // Border radius
    el.border_radius = extract_border_radius(style);

    // Dimensions
    let pos = style.get_position();
    el.width = extract_size(&pos.width);
    el.height = extract_size(&pos.height);
    el.min_width = extract_size(&pos.min_width);
    el.min_height = extract_size(&pos.min_height);
    el.max_width = extract_max_size(&pos.max_width);
    el.max_height = extract_max_size(&pos.max_height);

    // Aspect ratio
    // NOTE: `auto <ratio>` is treated the same as `<ratio>` — the `auto`
    // keyword only differs for replaced elements (img, video), which we
    // don't yet handle. When replaced element support is added, check
    // `ar.auto` and prefer the intrinsic ratio when `auto` is set.
    {
        use style::values::generics::position::PreferredRatio;
        let ar = pos.aspect_ratio;
        if let PreferredRatio::Ratio(ratio) = ar.ratio {
            let w = ratio.0 .0;
            let h = ratio.1 .0;
            if w.is_finite() && h.is_finite() && w > 0.0 && h > 0.0 {
                el.aspect_ratio = Some(w / h);
            }
        }
    }

    // Inset (for positioned elements)
    el.inset = extract_inset(style);

    // Background
    el.background = extract_background(style);

    // Text color (inherited)
    el.color = abs_color_to_cg(&style.get_inherited_text().color);

    // Font properties (inherited)
    el.font = extract_font(style);

    // Box shadow
    el.box_shadow = extract_box_shadow(style);

    // Transform
    el.transform = extract_transform(style);
    if !el.transform.is_empty() {
        el.transform_origin = extract_transform_origin(style);
    }

    // Blend mode
    el.blend_mode = extract_blend_mode(style);

    // Flex container
    {
        use style::properties::longhands::flex_direction::computed_value::T as FlexDir;
        use style::properties::longhands::flex_wrap::computed_value::T as FlexWr;

        el.flex_direction = match style.clone_flex_direction() {
            FlexDir::Row => types::FlexDirection::Row,
            FlexDir::RowReverse => types::FlexDirection::RowReverse,
            FlexDir::Column => types::FlexDirection::Column,
            FlexDir::ColumnReverse => types::FlexDirection::ColumnReverse,
        };
        el.flex_wrap = match style.clone_flex_wrap() {
            FlexWr::Nowrap => types::FlexWrap::Nowrap,
            FlexWr::Wrap => types::FlexWrap::Wrap,
            FlexWr::WrapReverse => types::FlexWrap::WrapReverse,
        };
        // align-items
        let ai = style.clone_align_items();
        let ai_flags = ai.0.value();
        use style::values::specified::align::AlignFlags;
        el.align_items = match ai_flags {
            f if f == AlignFlags::CENTER => types::AlignItems::Center,
            f if f == AlignFlags::FLEX_START || f == AlignFlags::START => types::AlignItems::Start,
            f if f == AlignFlags::FLEX_END || f == AlignFlags::END => types::AlignItems::End,
            f if f == AlignFlags::BASELINE => types::AlignItems::Baseline,
            _ => types::AlignItems::Stretch,
        };
        // justify-content
        let jc = style.clone_justify_content();
        let jc_flags = jc.primary().value();
        el.justify_content = match jc_flags {
            f if f == AlignFlags::CENTER => types::JustifyContent::Center,
            f if f == AlignFlags::FLEX_START || f == AlignFlags::START => {
                types::JustifyContent::Start
            }
            f if f == AlignFlags::FLEX_END || f == AlignFlags::END => types::JustifyContent::End,
            f if f == AlignFlags::SPACE_BETWEEN => types::JustifyContent::SpaceBetween,
            f if f == AlignFlags::SPACE_AROUND => types::JustifyContent::SpaceAround,
            f if f == AlignFlags::SPACE_EVENLY => types::JustifyContent::SpaceEvenly,
            _ => types::JustifyContent::Start,
        };
        // gap
        use style::values::generics::length::LengthPercentageOrNormal;
        let gap_to_px =
            |gap: &style::values::computed::length::NonNegativeLengthPercentageOrNormal| -> f32 {
                match gap {
                    LengthPercentageOrNormal::Normal => 0.0,
                    LengthPercentageOrNormal::LengthPercentage(lp) => {
                        lp.0.to_length().map(|l| l.px()).unwrap_or(0.0)
                    }
                }
            };
        el.row_gap = gap_to_px(&pos.row_gap);
        el.column_gap = gap_to_px(&pos.column_gap);
    }

    // Flex child
    el.flex_grow = style.clone_flex_grow().0;
    el.flex_shrink = style.clone_flex_shrink().0;

    // Grid container
    if el.display == types::Display::Grid {
        el.grid_template_columns = extract_grid_template(&style.clone_grid_template_columns());
        el.grid_template_rows = extract_grid_template(&style.clone_grid_template_rows());
        el.grid_auto_columns = extract_implicit_tracks(&style.clone_grid_auto_columns());
        el.grid_auto_rows = extract_implicit_tracks(&style.clone_grid_auto_rows());
        el.grid_auto_flow = extract_grid_auto_flow(&style.clone_grid_auto_flow());
    }

    // Grid child
    el.grid_column_start = extract_grid_placement(&style.clone_grid_column_start());
    el.grid_column_end = extract_grid_placement(&style.clone_grid_column_end());
    el.grid_row_start = extract_grid_placement(&style.clone_grid_row_start());
    el.grid_row_end = extract_grid_placement(&style.clone_grid_row_end());

    el
}

// ─── Helpers ─────────────────────────────────────────────────────────

fn extract_padding(style: &ComputedValues) -> EdgeInsets {
    let p = style.get_padding();
    let lp = |lp: &style::values::computed::NonNegativeLengthPercentage| -> f32 {
        lp.0.to_length().map(|l| l.px()).unwrap_or(0.0)
    };
    EdgeInsets {
        top: lp(&p.padding_top),
        right: lp(&p.padding_right),
        bottom: lp(&p.padding_bottom),
        left: lp(&p.padding_left),
    }
}

fn extract_css_margin(style: &ComputedValues) -> CssEdgeInsets {
    fn extract_side(v: style::values::computed::Margin) -> CssLength {
        if v.is_auto() {
            return CssLength::Auto;
        }
        match v {
            style::values::computed::Margin::LengthPercentage(lp) => {
                if let Some(len) = lp.to_length() {
                    CssLength::Px(len.px())
                } else {
                    CssLength::Px(0.0)
                }
            }
            _ => CssLength::Px(0.0),
        }
    }
    CssEdgeInsets {
        top: extract_side(style.clone_margin_top()),
        right: extract_side(style.clone_margin_right()),
        bottom: extract_side(style.clone_margin_bottom()),
        left: extract_side(style.clone_margin_left()),
    }
}

fn extract_border(style: &ComputedValues) -> BorderBox {
    let b = style.get_border();

    let extract_side_style =
        |bs: style::values::specified::border::BorderStyle| -> types::BorderStyle {
            use style::values::specified::border::BorderStyle as BS;
            match bs {
                BS::None => types::BorderStyle::None,
                BS::Solid => types::BorderStyle::Solid,
                BS::Dashed => types::BorderStyle::Dashed,
                BS::Dotted => types::BorderStyle::Dotted,
                BS::Double => types::BorderStyle::Double,
                BS::Groove => types::BorderStyle::Groove,
                BS::Ridge => types::BorderStyle::Ridge,
                BS::Inset => types::BorderStyle::Inset,
                BS::Outset => types::BorderStyle::Outset,
                _ => types::BorderStyle::None,
            }
        };

    let extract_color = |color: &style::values::computed::Color| -> CGColor {
        color
            .as_absolute()
            .map(abs_color_to_cg)
            .unwrap_or(CGColor::BLACK)
    };

    BorderBox {
        top: BorderSide {
            width: b.border_top_width.to_f32_px(),
            color: extract_color(&style.clone_border_top_color()),
            style: extract_side_style(b.border_top_style),
        },
        right: BorderSide {
            width: b.border_right_width.to_f32_px(),
            color: extract_color(&style.clone_border_right_color()),
            style: extract_side_style(b.border_right_style),
        },
        bottom: BorderSide {
            width: b.border_bottom_width.to_f32_px(),
            color: extract_color(&style.clone_border_bottom_color()),
            style: extract_side_style(b.border_bottom_style),
        },
        left: BorderSide {
            width: b.border_left_width.to_f32_px(),
            color: extract_color(&style.clone_border_left_color()),
            style: extract_side_style(b.border_left_style),
        },
    }
}

fn extract_border_radius(style: &ComputedValues) -> CornerRadii {
    let b = style.get_border();
    let lp = |lp: &style::values::computed::NonNegativeLengthPercentage| -> f32 {
        lp.0.to_length().map(|l| l.px()).unwrap_or(0.0)
    };
    CornerRadii {
        tl_x: lp(&b.border_top_left_radius.0.width),
        tl_y: lp(&b.border_top_left_radius.0.height),
        tr_x: lp(&b.border_top_right_radius.0.width),
        tr_y: lp(&b.border_top_right_radius.0.height),
        br_x: lp(&b.border_bottom_right_radius.0.width),
        br_y: lp(&b.border_bottom_right_radius.0.height),
        bl_x: lp(&b.border_bottom_left_radius.0.width),
        bl_y: lp(&b.border_bottom_left_radius.0.height),
    }
}

fn extract_size(
    size: &GenericSize<style::values::computed::NonNegativeLengthPercentage>,
) -> CssLength {
    match size {
        GenericSize::LengthPercentage(lp) => {
            if let Some(len) = lp.0.to_length() {
                CssLength::Px(len.px())
            } else if let Some(pct) = lp.0.to_percentage() {
                CssLength::Percent(pct.0)
            } else {
                CssLength::Auto
            }
        }
        _ => CssLength::Auto,
    }
}

fn extract_max_size(
    size: &style::values::generics::length::GenericMaxSize<
        style::values::computed::NonNegativeLengthPercentage,
    >,
) -> CssLength {
    use style::values::generics::length::GenericMaxSize;
    match size {
        GenericMaxSize::LengthPercentage(lp) => {
            if let Some(len) = lp.0.to_length() {
                CssLength::Px(len.px())
            } else if let Some(pct) = lp.0.to_percentage() {
                CssLength::Percent(pct.0)
            } else {
                CssLength::Auto
            }
        }
        _ => CssLength::Auto, // None, MaxContent, MinContent, FitContent, etc.
    }
}

fn extract_inset(_style: &ComputedValues) -> CssEdgeInsets {
    // TODO: extract top/right/bottom/left inset for positioned elements
    CssEdgeInsets::default()
}

fn extract_background(style: &ComputedValues) -> Vec<BackgroundLayer> {
    use style::values::generics::image::{GenericGradient, GenericImage};

    let bg = style.get_background();
    let mut layers: Vec<BackgroundLayer> = Vec::new();

    // 1. Background color (bottom layer)
    if let Some(abs) = bg.background_color.as_absolute() {
        let c = abs_color_to_cg(abs);
        if c.a > 0 {
            layers.push(BackgroundLayer::Solid(c));
        }
    }

    // 2. Background image layers (gradients on top)
    for image in bg.background_image.0.iter() {
        if let GenericImage::Gradient(gradient) = image {
            match gradient.as_ref() {
                GenericGradient::Linear {
                    direction, items, ..
                } => {
                    let stops = gradient_items_to_stops(items);
                    if stops.is_empty() {
                        continue;
                    }
                    let angle_deg = extract_gradient_angle(direction);
                    layers.push(BackgroundLayer::LinearGradient(LinearGradient {
                        angle_deg,
                        stops,
                    }));
                }
                GenericGradient::Radial { items, .. } => {
                    let stops = gradient_items_to_stops(items);
                    if stops.is_empty() {
                        continue;
                    }
                    layers.push(BackgroundLayer::RadialGradient(RadialGradient { stops }));
                }
                GenericGradient::Conic { items, .. } => {
                    let stops = conic_gradient_items_to_stops(items);
                    if stops.is_empty() {
                        continue;
                    }
                    layers.push(BackgroundLayer::ConicGradient(ConicGradient { stops }));
                }
            }
        }
    }

    layers
}

/// Extract the CSS gradient angle in degrees.
///
/// CSS gradient angles: 0deg = to top, 90deg = to right (clockwise).
/// `LineDirection::Corner(h, v)` gives the target corner — "to bottom left"
/// is `Corner(Left, Bottom)`.
fn extract_gradient_angle(direction: &style::values::computed::image::LineDirection) -> f32 {
    use style::values::computed::image::LineDirection;
    use style::values::specified::position::{HorizontalPositionKeyword, VerticalPositionKeyword};

    match direction {
        LineDirection::Angle(angle) => angle.degrees(),
        LineDirection::Vertical(v) => match v {
            VerticalPositionKeyword::Top => 0.0,
            VerticalPositionKeyword::Bottom => 180.0,
        },
        LineDirection::Horizontal(h) => match h {
            HorizontalPositionKeyword::Left => 270.0,
            HorizontalPositionKeyword::Right => 90.0,
        },
        LineDirection::Corner(h, v) => {
            // CSS corner gradients: map target corner to CSS angle
            match (h, v) {
                (HorizontalPositionKeyword::Right, VerticalPositionKeyword::Top) => 45.0,
                (HorizontalPositionKeyword::Right, VerticalPositionKeyword::Bottom) => 135.0,
                (HorizontalPositionKeyword::Left, VerticalPositionKeyword::Bottom) => 225.0,
                (HorizontalPositionKeyword::Left, VerticalPositionKeyword::Top) => 315.0,
            }
        }
    }
}

/// Convert Stylo gradient items to GradientStops.
fn gradient_items_to_stops(
    items: &[style::values::generics::image::GenericGradientItem<
        style::values::computed::Color,
        style::values::computed::LengthPercentage,
    >],
) -> Vec<GradientStop> {
    use style::values::generics::image::GenericGradientItem;

    let mut raw: Vec<(Option<f32>, CGColor)> = Vec::new();
    for item in items {
        match item {
            GenericGradientItem::SimpleColorStop(color) => {
                let c = color
                    .as_absolute()
                    .map(abs_color_to_cg)
                    .unwrap_or(CGColor::TRANSPARENT);
                raw.push((None, c));
            }
            GenericGradientItem::ComplexColorStop { color, position } => {
                let offset = position.to_percentage().map(|p| p.0);
                let c = color
                    .as_absolute()
                    .map(abs_color_to_cg)
                    .unwrap_or(CGColor::TRANSPARENT);
                raw.push((offset, c));
            }
            GenericGradientItem::InterpolationHint(_) => {}
        }
    }
    auto_distribute_stops(&mut raw);
    raw.into_iter()
        .map(|(o, c)| GradientStop {
            offset: o.unwrap_or(0.0),
            color: c,
        })
        .collect()
}

/// Convert conic-gradient items to GradientStops.
fn conic_gradient_items_to_stops(
    items: &[style::values::generics::image::GenericGradientItem<
        style::values::computed::Color,
        style::values::computed::AngleOrPercentage,
    >],
) -> Vec<GradientStop> {
    use style::values::computed::AngleOrPercentage;
    use style::values::generics::image::GenericGradientItem;

    let mut raw: Vec<(Option<f32>, CGColor)> = Vec::new();
    for item in items {
        match item {
            GenericGradientItem::SimpleColorStop(color) => {
                let c = color
                    .as_absolute()
                    .map(abs_color_to_cg)
                    .unwrap_or(CGColor::TRANSPARENT);
                raw.push((None, c));
            }
            GenericGradientItem::ComplexColorStop { color, position } => {
                let offset = match position {
                    AngleOrPercentage::Percentage(p) => Some(p.0),
                    AngleOrPercentage::Angle(a) => Some(a.degrees() / 360.0),
                };
                let c = color
                    .as_absolute()
                    .map(abs_color_to_cg)
                    .unwrap_or(CGColor::TRANSPARENT);
                raw.push((offset, c));
            }
            GenericGradientItem::InterpolationHint(_) => {}
        }
    }
    auto_distribute_stops(&mut raw);
    raw.into_iter()
        .map(|(o, c)| GradientStop {
            offset: o.unwrap_or(0.0),
            color: c,
        })
        .collect()
}

/// Auto-distribute gradient stop offsets (first=0, last=1, gaps interpolated).
fn auto_distribute_stops(raw: &mut [(Option<f32>, CGColor)]) {
    let n = raw.len();
    if n == 0 {
        return;
    }
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
        let s = raw[start].0.unwrap();
        let e = raw[end].0.unwrap();
        let count = (end - start) as f32;
        #[allow(clippy::needless_range_loop)]
        for j in (start + 1)..end {
            raw[j].0 = Some(s + (j - start) as f32 / count * (e - s));
        }
        i = end + 1;
    }
}

fn extract_box_shadow(style: &ComputedValues) -> Vec<BoxShadow> {
    let shadows = style.clone_box_shadow();
    shadows
        .0
        .iter()
        .map(|s| {
            let color = s
                .base
                .color
                .as_absolute()
                .map(abs_color_to_cg)
                .unwrap_or(CGColor::BLACK);
            BoxShadow {
                offset_x: s.base.horizontal.px(),
                offset_y: s.base.vertical.px(),
                blur: s.base.blur.0.px(),
                spread: s.spread.px(),
                color,
                inset: s.inset,
            }
        })
        .collect()
}

// ─── Grid property extraction ───────────────────────────────────────

/// Convert a Stylo `GridTemplateComponent` (computed) to our IR.
///
/// Stylo's computed grid-template uses `CSSInteger` (= `i32`) for repeat counts.
fn extract_grid_template(
    tpl: &style::values::generics::grid::GenericGridTemplateComponent<
        style::values::computed::LengthPercentage,
        i32,
    >,
) -> Vec<types::GridTemplateEntry> {
    use style::values::generics::grid::GenericGridTemplateComponent;
    match tpl {
        GenericGridTemplateComponent::None | GenericGridTemplateComponent::Masonry => Vec::new(),
        GenericGridTemplateComponent::Subgrid(_) => Vec::new(), // subgrid not supported
        GenericGridTemplateComponent::TrackList(track_list) => {
            use style::values::generics::grid::GenericTrackListValue;
            let mut entries = Vec::new();
            for value in track_list.values.iter() {
                match value {
                    GenericTrackListValue::TrackSize(ts) => {
                        entries.push(types::GridTemplateEntry::Track(stylo_track_size(ts)));
                    }
                    GenericTrackListValue::TrackRepeat(rep) => {
                        use style::values::generics::grid::RepeatCount;
                        let count = match rep.count {
                            RepeatCount::Number(n) => types::RepeatCount::Count(n as u16),
                            RepeatCount::AutoFill => types::RepeatCount::AutoFill,
                            RepeatCount::AutoFit => types::RepeatCount::AutoFit,
                        };
                        let tracks: Vec<types::TrackSize> =
                            rep.track_sizes.iter().map(stylo_track_size).collect();
                        entries.push(types::GridTemplateEntry::Repeat(count, tracks));
                    }
                }
            }
            entries
        }
    }
}

/// Convert Stylo `ImplicitGridTracks` (grid-auto-columns/rows) to our IR.
fn extract_implicit_tracks(
    tracks: &style::values::generics::grid::GenericImplicitGridTracks<
        style::values::generics::grid::GenericTrackSize<style::values::computed::LengthPercentage>,
    >,
) -> Vec<types::TrackSize> {
    tracks.0.iter().map(stylo_track_size).collect()
}

/// Convert a single Stylo `TrackSize` to our IR.
fn stylo_track_size(
    ts: &style::values::generics::grid::GenericTrackSize<style::values::computed::LengthPercentage>,
) -> types::TrackSize {
    use style::values::generics::grid::GenericTrackSize;
    match ts {
        GenericTrackSize::Breadth(b) => types::TrackSize::Single(stylo_track_breadth(b)),
        GenericTrackSize::Minmax(min_b, max_b) => {
            types::TrackSize::MinMax(stylo_track_breadth(min_b), stylo_track_breadth(max_b))
        }
        GenericTrackSize::FitContent(b) => types::TrackSize::FitContent(stylo_track_breadth(b)),
    }
}

/// Convert a single Stylo `TrackBreadth` to our IR.
fn stylo_track_breadth(
    b: &style::values::generics::grid::GenericTrackBreadth<
        style::values::computed::LengthPercentage,
    >,
) -> types::TrackBreadth {
    use style::values::generics::grid::GenericTrackBreadth;
    match b {
        GenericTrackBreadth::Breadth(lp) => {
            if let Some(len) = lp.to_length() {
                types::TrackBreadth::Px(len.px())
            } else if let Some(pct) = lp.to_percentage() {
                types::TrackBreadth::Percent(pct.0)
            } else {
                types::TrackBreadth::Auto
            }
        }
        GenericTrackBreadth::Fr(fr) => types::TrackBreadth::Fr(*fr),
        GenericTrackBreadth::Auto => types::TrackBreadth::Auto,
        GenericTrackBreadth::MinContent => types::TrackBreadth::MinContent,
        GenericTrackBreadth::MaxContent => types::TrackBreadth::MaxContent,
    }
}

/// Convert Stylo `GridAutoFlow` to our IR.
fn extract_grid_auto_flow(
    flow: &style::values::specified::position::GridAutoFlow,
) -> types::GridAutoFlow {
    let is_column = flow.contains(style::values::specified::position::GridAutoFlow::COLUMN);
    let is_dense = flow.contains(style::values::specified::position::GridAutoFlow::DENSE);
    match (is_column, is_dense) {
        (false, false) => types::GridAutoFlow::Row,
        (false, true) => types::GridAutoFlow::RowDense,
        (true, false) => types::GridAutoFlow::Column,
        (true, true) => types::GridAutoFlow::ColumnDense,
    }
}

/// Convert a Stylo `GridLine` (grid-column-start/end, grid-row-start/end) to our IR.
///
/// Stylo's computed grid-line uses `CSSInteger` (= `i32`) for line numbers.
fn extract_grid_placement(
    line: &style::values::generics::grid::GenericGridLine<i32>,
) -> types::GridPlacement {
    if line.is_auto() {
        return types::GridPlacement::Auto;
    }
    if line.is_span {
        let n = line.line_num.unsigned_abs() as u16;
        return types::GridPlacement::Span(if n == 0 { 1 } else { n });
    }
    let num = line.line_num;
    if num != 0 {
        return types::GridPlacement::Line(num as i16);
    }
    // line_num == 0 with ident only → treat as auto (named lines not supported)
    types::GridPlacement::Auto
}

fn extract_font(style: &ComputedValues) -> FontProps {
    let font = style.get_font();
    let inherited_text = style.get_inherited_text();

    let families: Vec<String> = font
        .font_family
        .families
        .iter()
        .map(|f| {
            use style::values::computed::font::SingleFontFamily;
            match f {
                SingleFontFamily::FamilyName(name) => name.name.to_string(),
                SingleFontFamily::Generic(_) => "system-ui".to_string(),
            }
        })
        .collect();

    let line_height = match &font.line_height {
        StyloLineHeight::Normal => LineHeight::Normal,
        StyloLineHeight::Number(n) => LineHeight::Number(n.0),
        StyloLineHeight::Length(len) => LineHeight::Px(len.0.px()),
    };

    let letter_spacing = inherited_text
        .letter_spacing
        .0
        .to_length()
        .map(|l| l.px())
        .unwrap_or(0.0);
    let word_spacing = inherited_text
        .word_spacing
        .to_length()
        .map(|l| l.px())
        .unwrap_or(0.0);

    let mut props = FontProps {
        size: font.font_size.computed_size().px(),
        weight: FontWeight(font.font_weight.value() as u32),
        italic: font.font_style == style::values::computed::FontStyle::ITALIC,
        families,
        line_height,
        letter_spacing,
        word_spacing,
        ..Default::default()
    };

    // Text align
    use style::values::specified::text::TextAlignKeyword;
    props.text_align = match inherited_text.text_align {
        TextAlignKeyword::Start | TextAlignKeyword::Left | TextAlignKeyword::MozLeft => {
            TextAlign::Left
        }
        TextAlignKeyword::End | TextAlignKeyword::Right | TextAlignKeyword::MozRight => {
            TextAlign::Right
        }
        TextAlignKeyword::Center | TextAlignKeyword::MozCenter => TextAlign::Center,
        TextAlignKeyword::Justify => TextAlign::Justify,
    };

    // Text transform
    {
        use style::values::specified::text::TextTransformCase;
        let tt = style.clone_text_transform();
        let case = tt.case();
        props.text_transform = if case == TextTransformCase::Uppercase {
            TextTransform::Uppercase
        } else if case == TextTransformCase::Lowercase {
            TextTransform::Lowercase
        } else if case == TextTransformCase::Capitalize {
            TextTransform::Capitalize
        } else {
            TextTransform::None
        };
    }

    // Text decoration (bitfield — multiple can be active simultaneously)
    let td_line = style.clone_text_decoration_line();
    props.decoration_underline = td_line.intersects(StyloTextDecorationLine::UNDERLINE);
    props.decoration_overline = td_line.intersects(StyloTextDecorationLine::OVERLINE);
    props.decoration_line_through = td_line.intersects(StyloTextDecorationLine::LINE_THROUGH);

    // White-space (decomposed into collapse + wrap in modern CSS/Stylo)
    {
        use style::properties::longhands::text_wrap_mode::computed_value::T as TWM;
        use style::properties::longhands::white_space_collapse::computed_value::T as WSC;
        let collapse = style.clone_white_space_collapse();
        let wrap = style.clone_text_wrap_mode();
        props.white_space = match (collapse, wrap) {
            (WSC::Preserve, TWM::Nowrap) => WhiteSpace::Pre,
            (WSC::Preserve, TWM::Wrap) => WhiteSpace::PreWrap,
            (WSC::PreserveBreaks, TWM::Wrap) => WhiteSpace::PreLine,
            (WSC::Collapse, TWM::Nowrap) => WhiteSpace::Nowrap,
            _ => WhiteSpace::Normal,
        };
    }

    props
}

fn extract_blend_mode(style: &ComputedValues) -> BlendMode {
    use style::properties::longhands::mix_blend_mode::computed_value::T as MixBlend;
    match style.get_effects().mix_blend_mode {
        MixBlend::Normal => BlendMode::Normal,
        MixBlend::Multiply => BlendMode::Multiply,
        MixBlend::Screen => BlendMode::Screen,
        MixBlend::Overlay => BlendMode::Overlay,
        MixBlend::Darken => BlendMode::Darken,
        MixBlend::Lighten => BlendMode::Lighten,
        MixBlend::ColorDodge => BlendMode::ColorDodge,
        MixBlend::ColorBurn => BlendMode::ColorBurn,
        MixBlend::HardLight => BlendMode::HardLight,
        MixBlend::SoftLight => BlendMode::SoftLight,
        MixBlend::Difference => BlendMode::Difference,
        MixBlend::Exclusion => BlendMode::Exclusion,
        MixBlend::Hue => BlendMode::Hue,
        MixBlend::Saturation => BlendMode::Saturation,
        MixBlend::Color => BlendMode::Color,
        MixBlend::Luminosity => BlendMode::Luminosity,
        _ => BlendMode::Normal,
    }
}

// ─── Transform extraction ───────────────────────────────────────────

/// Extract CSS `transform` operations, preserving percentage/length operands.
/// Returns an empty Vec for `transform: none`.
fn extract_transform(style: &ComputedValues) -> Vec<types::TransformOp> {
    use style::values::computed::transform::TransformOperation;
    use types::{LengthPercentage as LP, TransformOp};

    let transform = style.get_box().clone_transform();
    let ops = &transform.0;
    if ops.is_empty() {
        return Vec::new();
    }

    let resolve_lp = |lp: &style::values::computed::LengthPercentage| -> LP {
        if let Some(pct) = lp.to_percentage() {
            LP::Percent(pct.0)
        } else if let Some(len) = lp.to_length() {
            LP::Px(len.px())
        } else {
            LP::Px(0.0)
        }
    };

    let mut result = Vec::with_capacity(ops.len());
    for op in ops.iter() {
        let ir_op = match op {
            TransformOperation::Matrix(mat) => {
                TransformOp::Matrix([mat.a, mat.b, mat.c, mat.d, mat.e, mat.f])
            }
            TransformOperation::Matrix3D(mat) => {
                TransformOp::Matrix([mat.m11, mat.m12, mat.m21, mat.m22, mat.m41, mat.m42])
            }
            TransformOperation::Translate(tx, ty) | TransformOperation::Translate3D(tx, ty, _) => {
                TransformOp::Translate(resolve_lp(tx), resolve_lp(ty))
            }
            TransformOperation::TranslateX(tx) => {
                TransformOp::Translate(resolve_lp(tx), LP::Px(0.0))
            }
            TransformOperation::TranslateY(ty) => {
                TransformOp::Translate(LP::Px(0.0), resolve_lp(ty))
            }
            TransformOperation::Scale(sx, sy) | TransformOperation::Scale3D(sx, sy, _) => {
                TransformOp::Scale(*sx, *sy)
            }
            TransformOperation::ScaleX(sx) => TransformOp::Scale(*sx, 1.0),
            TransformOperation::ScaleY(sy) => TransformOp::Scale(1.0, *sy),
            TransformOperation::Rotate(angle) | TransformOperation::RotateZ(angle) => {
                TransformOp::Rotate(angle.radians())
            }
            TransformOperation::Skew(ax, ay) => TransformOp::Skew(ax.radians(), ay.radians()),
            TransformOperation::SkewX(ax) => TransformOp::Skew(ax.radians(), 0.0),
            TransformOperation::SkewY(ay) => TransformOp::Skew(0.0, ay.radians()),
            // Z-only and 3D-only ops have no 2D effect
            _ => continue,
        };
        result.push(ir_op);
    }
    result
}

/// Extract CSS `transform-origin`, preserving px vs % for each axis.
fn extract_transform_origin(style: &ComputedValues) -> types::TransformOrigin {
    use types::LengthPercentage as LP;

    let origin = style.get_box().clone_transform_origin();

    let resolve = |lp: &style::values::computed::LengthPercentage| -> LP {
        if let Some(pct) = lp.to_percentage() {
            LP::Percent(pct.0)
        } else if let Some(len) = lp.to_length() {
            LP::Px(len.px())
        } else {
            LP::Percent(0.5)
        }
    };

    types::TransformOrigin {
        x: resolve(&origin.horizontal),
        y: resolve(&origin.vertical),
    }
}

fn map_overflow(ov: style::values::specified::box_::Overflow) -> types::Overflow {
    use style::values::specified::box_::Overflow as OV;
    match ov {
        OV::Visible => types::Overflow::Visible,
        OV::Hidden => types::Overflow::Hidden,
        OV::Scroll => types::Overflow::Scroll,
        OV::Auto => types::Overflow::Auto,
        OV::Clip => types::Overflow::Clip,
    }
}

fn abs_color_to_cg(color: &AbsoluteColor) -> CGColor {
    let srgb = color.to_color_space(ColorSpace::Srgb);
    CGColor::from_rgba(
        (srgb.components.0.clamp(0.0, 1.0) * 255.0) as u8,
        (srgb.components.1.clamp(0.0, 1.0) * 255.0) as u8,
        (srgb.components.2.clamp(0.0, 1.0) * 255.0) as u8,
        (srgb.alpha.clamp(0.0, 1.0) * 255.0) as u8,
    )
}

fn process_whitespace(text: &str, ws: WhiteSpace) -> String {
    match ws {
        WhiteSpace::Pre | WhiteSpace::PreWrap => text.to_string(),
        WhiteSpace::PreLine => {
            // Collapse spaces/tabs but keep newlines
            let mut result = String::with_capacity(text.len());
            let mut prev_was_space = false;
            for ch in text.chars() {
                if ch == '\n' {
                    result.push('\n');
                    prev_was_space = false;
                } else if ch.is_whitespace() {
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
        _ => {
            // Normal / Nowrap: collapse all whitespace
            let mut result = String::with_capacity(text.len());
            let mut prev_was_space = false;
            for ch in text.chars() {
                if ch.is_whitespace() {
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
    }
}
