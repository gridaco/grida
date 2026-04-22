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
pub(crate) fn collect_styled_tree(html: &str) -> Result<Option<StyledElement>, String> {
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
    /// HTML `<ol type="i">`-style override. Takes precedence over CSS
    /// `list-style-type` and provides Roman numerals even though Stylo's
    /// servo build does not parse `list-style-type: lower-roman`.
    type_override: Option<types::ListStyleType>,
}

/// Output of marker generation: either a geometric symbol (painted as
/// an ellipse or rect) or a formatted text string (counters with
/// prefix/suffix).
///
/// Mirrors Chromium's `ListStyleCategory::{kSymbol, kLanguage}` split.
enum MarkerOutput {
    Symbol(types::SymbolMarkerKind),
    Text(String),
}

/// Parse Stylo's generated `ListStyleType` enum into our typed
/// [`types::ListStyleType`] via `Debug` string matching. Stylo's
/// servo-mode enum is generated and not structurally accessible, so we
/// fall back to string inspection. Unrecognized keywords return `None`
/// and callers fall back to `disc`. Does not recognize `lower-roman`
/// or `upper-roman` — servo Stylo parses them as invalid.
fn parse_stylo_list_style_type<T: std::fmt::Debug>(lst: &T) -> Option<types::ListStyleType> {
    use types::ListStyleType as L;
    let debug = format!("{:?}", lst);
    if debug.contains("None") {
        return Some(L::None);
    }
    if debug.contains("Disc") {
        return Some(L::Disc);
    }
    if debug.contains("Circle") {
        return Some(L::Circle);
    }
    if debug.contains("Square") {
        return Some(L::Square);
    }
    if debug.contains("DecimalLeadingZero") {
        return Some(L::DecimalLeadingZero);
    }
    if debug.contains("Decimal") {
        return Some(L::Decimal);
    }
    if debug.contains("LowerAlpha") {
        return Some(L::LowerAlpha);
    }
    if debug.contains("UpperAlpha") {
        return Some(L::UpperAlpha);
    }
    if debug.contains("LowerRoman") {
        return Some(L::LowerRoman);
    }
    if debug.contains("UpperRoman") {
        return Some(L::UpperRoman);
    }
    None
}

/// Marker output for a Stylo-reported list-style-type. Unknown values
/// fall back to `disc` (matching CSS spec for unrecognized keywords).
fn generate_marker_output<T: std::fmt::Debug>(lst: &T, ordinal: i32) -> Option<MarkerOutput> {
    marker_output_for_type(
        parse_stylo_list_style_type(lst).unwrap_or(types::ListStyleType::Disc),
        ordinal,
    )
}

/// Marker output for an explicit `ListStyleType`. Used both by the
/// Stylo path (via [`generate_marker_output`]) and by the HTML
/// attribute path (`<ol type>` / `<ul type>`).
fn marker_output_for_type(ty: types::ListStyleType, ordinal: i32) -> Option<MarkerOutput> {
    use types::ListStyleType as L;
    use types::SymbolMarkerKind as S;
    // Base-26 alphabetic counter per CSS Counter Styles 3 — after `z`
    // comes `aa`, `ab`, … so `type="a" start="27"` renders `aa.`.
    // Non-positive ordinals fall back to decimal (the alphabetic system
    // has no representation for 0 or negatives).
    let alpha = |base: u8| {
        if ordinal <= 0 {
            return format!("{}. ", ordinal);
        }
        let mut n = ordinal;
        let mut s = String::new();
        while n > 0 {
            n -= 1;
            s.insert(0, (base + (n % 26) as u8) as char);
            n /= 26;
        }
        format!("{s}. ")
    };
    // `decimal-leading-zero` pads to two digits, matching CSS and
    // browsers (01., 02., … 09., 10., 11., …).
    let decimal_leading_zero = |n: i32| {
        if n < 0 {
            format!("-{:02}. ", (n as i64).unsigned_abs())
        } else {
            format!("{:02}. ", n)
        }
    };
    Some(match ty {
        L::None => return None,
        L::Disc => MarkerOutput::Symbol(S::Disc),
        L::Circle => MarkerOutput::Symbol(S::Circle),
        L::Square => MarkerOutput::Symbol(S::Square),
        L::Decimal => MarkerOutput::Text(format!("{}. ", ordinal)),
        L::DecimalLeadingZero => MarkerOutput::Text(decimal_leading_zero(ordinal)),
        L::LowerAlpha => MarkerOutput::Text(alpha(b'a')),
        L::UpperAlpha => MarkerOutput::Text(alpha(b'A')),
        L::LowerRoman => MarkerOutput::Text(format!("{}. ", to_roman(ordinal).to_lowercase())),
        L::UpperRoman => MarkerOutput::Text(format!("{}. ", to_roman(ordinal))),
    })
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
        // HTML `<ol type="i">` overrides CSS list-style-type per the HTML
        // spec. This also routes around Stylo's servo-mode inability to
        // parse `list-style-type: lower-roman`/`upper-roman`.
        let dom = adapter::dom();
        let node = dom.node(element.node_id());
        let type_override = get_element_attr(node, "type").and_then(|t| match t.as_str() {
            "1" => Some(types::ListStyleType::Decimal),
            "a" => Some(types::ListStyleType::LowerAlpha),
            "A" => Some(types::ListStyleType::UpperAlpha),
            "i" => Some(types::ListStyleType::LowerRoman),
            "I" => Some(types::ListStyleType::UpperRoman),
            _ => None,
        });
        // `<ol start="N">` sets the starting ordinal. Negative and zero
        // values are permitted by the HTML spec.
        let start = get_element_attr(node, "start")
            .and_then(|s| s.trim().parse::<i32>().ok())
            .unwrap_or(1);
        Some(ListCounter {
            value: start,
            type_override,
        })
    } else if tag == "ul" || tag == "menu" {
        // Unordered lists still seed the list-item counter at 1 —
        // author CSS may set `list-style-type` to a numeric style
        // (decimal, lower-alpha, …) on a `<ul>`. Legacy HTML
        // `<ul type="disc|circle|square">` is obsolete but widely
        // honored; read it so fixtures relying on the attribute render
        // the expected bullet shape without needing CSS.
        let dom = adapter::dom();
        let node = dom.node(element.node_id());
        let type_override = get_element_attr(node, "type").and_then(|t| {
            // HTML4 specifies the attribute as case-insensitive.
            match t.to_ascii_lowercase().as_str() {
                "disc" => Some(types::ListStyleType::Disc),
                "circle" => Some(types::ListStyleType::Circle),
                "square" => Some(types::ListStyleType::Square),
                _ => None,
            }
        });
        Some(ListCounter {
            value: 1,
            type_override,
        })
    } else {
        None
    };

    // Use parent's counter if this is a list item
    let marker_prefix = if is_list_item {
        // `<li value="N">` resets this item's ordinal and seeds the counter
        // for subsequent siblings (HTML §4.4.8). Applied before the counter
        // is read below.
        if let Some(ref mut counter) = list_counter {
            let dom = adapter::dom();
            let node = dom.node(element.node_id());
            if let Some(v) =
                get_element_attr(node, "value").and_then(|s| s.trim().parse::<i32>().ok())
            {
                counter.value = v;
            }
        }

        // Get ordinal from parent counter; also inherit its HTML
        // `<ol type>` override if set.
        let (ordinal, type_override) = if let Some(ref mut counter) = list_counter {
            let val = counter.value;
            counter.value += 1;
            (val, counter.type_override)
        } else {
            (1, None)
        };

        if let Some(ov) = type_override {
            marker_output_for_type(ov, ordinal)
        } else {
            let list_style = style.get_list();
            let lst = list_style.clone_list_style_type();
            generate_marker_output(&lst, ordinal)
        }
    } else {
        None
    };

    // ── Widget detection (form controls) ──
    let dom = adapter::dom();
    let node_data = dom.node(element.node_id());

    let is_void_widget = detect_widget(&tag, node_data, dom, &mut el);

    // Extract object-fit / object-position from Stylo for replaced
    // elements (<img>).
    if el.replaced.is_some() {
        use style::properties::longhands::object_fit::computed_value::T as StyloObjectFit;
        let pos = style.get_position();
        let of = pos.clone_object_fit();
        let object_fit = match of {
            StyloObjectFit::Fill => types::ObjectFit::Fill,
            StyloObjectFit::Contain => types::ObjectFit::Contain,
            StyloObjectFit::Cover => types::ObjectFit::Cover,
            StyloObjectFit::None => types::ObjectFit::None,
            StyloObjectFit::ScaleDown => types::ObjectFit::ScaleDown,
        };
        let op = pos.clone_object_position();
        let object_position = BackgroundPosition {
            x: length_percentage_to_css(&op.horizontal),
            y: length_percentage_to_css(&op.vertical),
        };
        if let Some(ref mut replaced) = el.replaced {
            replaced.object_fit = object_fit;
            replaced.object_position = object_position;
        }
    }

    // Collect children, merging consecutive inline content into InlineGroups
    let mut pending_inline: Vec<InlineRunItem> = Vec::new();
    let parent_text_align = el.font.text_align;
    let parent_font = el.font.clone();
    let parent_color = el.color;
    let parent_white_space = el.font.white_space;

    // Inject list marker as first inline content (Chromium: ::marker pseudo-element).
    if let Some(marker) = marker_prefix {
        match marker {
            MarkerOutput::Symbol(kind) => {
                // Bullet gap is baked into `SymbolMarker::placeholder_size`.
                pending_inline.push(InlineRunItem::SymbolMarker(SymbolMarker {
                    kind,
                    color: parent_color,
                    font_size: parent_font.size,
                }));
            }
            MarkerOutput::Text(text) => {
                pending_inline.push(InlineRunItem::Text(TextRun {
                    text,
                    font: parent_font.clone(),
                    color: parent_color,
                    decoration: None,
                }));
            }
        }
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
                    if is_inline && !child.widget.is_widget() && child.replaced.is_none() {
                        collect_inline_items(&child, &mut pending_inline);
                    } else {
                        flush_inline_group(
                            &mut pending_inline,
                            parent_text_align,
                            el.font.direction,
                            el.font.text_indent,
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
    flush_inline_group(
        &mut pending_inline,
        parent_text_align,
        el.font.direction,
        el.font.text_indent,
        &mut el.children,
    );

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

// ─── Replaced element (<img>) detection ────────────────────────────

/// Extract `<img>` attributes into a `ReplacedContent`.
///
/// Follows the HTML spec for replaced elements:
/// - `src` — image URL
/// - `alt` — alternative text (for placeholder display)
/// - `width`/`height` — intrinsic size hints
fn detect_img_element(node: &DemoNode) -> ReplacedContent {
    let src = get_element_attr(node, "src").unwrap_or_default();
    let alt = get_element_attr(node, "alt");
    let attr_width = get_element_attr(node, "width").and_then(|s| s.parse::<u32>().ok());
    let attr_height = get_element_attr(node, "height").and_then(|s| s.parse::<u32>().ok());

    ReplacedContent {
        src,
        alt,
        attr_width,
        attr_height,
        object_fit: types::ObjectFit::Fill, // HTML spec default for <img>
        object_position: BackgroundPosition::center(),
    }
}

// ─── Widget (form control) detection ────────────────────────────────

/// Returns `true` for void elements (like `<input>`) whose DOM children
/// should be skipped.
fn detect_widget(tag: &str, node_data: &DemoNode, dom: &DemoDom, el: &mut StyledElement) -> bool {
    match tag {
        "img" => {
            el.replaced = Some(detect_img_element(node_data));
            // <img> is a replaced inline element — force inline-block so it
            // gets its own Taffy node (not merged into InlineGroup).
            if el.display == types::Display::Inline {
                el.display = types::Display::InlineBlock;
            }
            true // <img> is a void element
        }
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
        direction: el.font.direction,
        text_indent: el.font.text_indent,
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
        BackgroundLayer::Solid { color, .. } if color.a > 0 => Some(*color),
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
    direction: types::Direction,
    text_indent: CssLength,
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
        InlineRunItem::OpenBox { .. }
        | InlineRunItem::CloseBox { .. }
        | InlineRunItem::SymbolMarker(_) => false,
    });
    if all_whitespace {
        return;
    }

    children.push(StyledNode::InlineGroup(InlineGroup {
        items,
        text_align,
        direction,
        text_indent,
    }));
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
    el.overflow_clip_margin = style.get_margin().clone_overflow_clip_margin().px();

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

    // Box sizing (in Stylo, box-sizing is in the "position" property group)
    {
        let pos = style.get_position();
        use style::properties::longhands::box_sizing::computed_value::T as StyloBoxSizing;
        el.box_sizing = match pos.clone_box_sizing() {
            StyloBoxSizing::ContentBox => types::BoxSizing::ContentBox,
            StyloBoxSizing::BorderBox => types::BoxSizing::BorderBox,
        };
    }

    // Margin (may be auto or %)
    el.margin = extract_css_margin(style);

    // Padding (resolved to px)
    el.padding = extract_padding(style);

    // Text color (inherited) — must be resolved before any
    // `currentcolor`-aware extraction (background gradients, border image).
    el.color = abs_color_to_cg(&style.get_inherited_text().color);

    // Border
    el.border = extract_border(style, el.color);

    // Border image (9-slice)
    el.border_image = extract_border_image(style, el.color);

    // Border radius
    el.border_radius = extract_border_radius(style);

    // Outline (does not affect layout — paint-only)
    el.outline = extract_outline(style);

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

    // z-index (None when keyword `auto`)
    {
        use style::values::generics::position::ZIndex;
        el.z_index = match style.get_position().clone_z_index() {
            ZIndex::Integer(i) => Some(i),
            ZIndex::Auto => None,
        };
    }

    // Background
    el.background = extract_background(style, el.color);

    // Font properties (inherited)
    el.font = extract_font(style, el.color);

    // Box shadow
    el.box_shadow = extract_box_shadow(style, el.color);
    el.filter = extract_filter(style, el.color);
    el.clip_path = extract_clip_path(style);

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
        // align-items / justify-content — delegate to the shared helpers
        // so `safe`/`unsafe`/`legacy` modifier bits are masked out
        // (`AlignFlags` is a bitflags type; exact `==` on the whole
        // flag set would fail for e.g. `align-items: safe center`).
        el.align_items = align_flags_to_items(style.clone_align_items().0.value());
        el.justify_content =
            align_flags_to_explicit_justify(style.clone_justify_content().primary().value())
                .unwrap_or(types::JustifyContent::Start);
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

        // justify-items: per-cell alignment on the inline axis for grid.
        let ji_flags = style.clone_justify_items().computed.0.value();
        el.justify_items = align_flags_to_items(ji_flags);

        // align-content: row-track alignment (grid) or cross-axis content
        // alignment when flex-wrap splits lines. `normal`/`stretch` (the
        // defaults) leave `None` so Taffy uses the layout-method-appropriate
        // default (stretch behavior) instead of packing to start.
        let ac_flags = style.clone_align_content().primary().value();
        el.align_content = align_flags_to_explicit_justify(ac_flags);
    }

    // Per-child align-self / justify-self. Non-auto values override the
    // container's align-items / justify-items respectively.
    {
        use style::values::specified::align::AlignFlags;
        let as_flags = style.clone_align_self().value();
        if as_flags != AlignFlags::AUTO {
            el.align_self = Some(align_flags_to_items(as_flags));
        }
        let js_flags = style.clone_justify_self().value();
        if js_flags != AlignFlags::AUTO {
            el.justify_self = Some(align_flags_to_items(js_flags));
        }
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

/// Map Stylo `BorderStyle` to our `types::BorderStyle`.
/// Shared by border and outline extraction.
fn map_border_style(bs: style::values::specified::border::BorderStyle) -> types::BorderStyle {
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
}

fn extract_border(style: &ComputedValues, current_color: CGColor) -> BorderBox {
    let b = style.get_border();

    // `border-*-color` defaults to `currentcolor`, which Stylo leaves
    // unresolved to absolute. Fall back to the element's computed text
    // color so `border: solid` on red text draws a red border, not an
    // unexpected opaque black one.
    let extract_color = |color: &style::values::computed::Color| -> CGColor {
        color
            .as_absolute()
            .map(abs_color_to_cg)
            .unwrap_or(current_color)
    };

    BorderBox {
        top: BorderSide {
            width: b.border_top_width.to_f32_px(),
            color: extract_color(&style.clone_border_top_color()),
            style: map_border_style(b.border_top_style),
        },
        right: BorderSide {
            width: b.border_right_width.to_f32_px(),
            color: extract_color(&style.clone_border_right_color()),
            style: map_border_style(b.border_right_style),
        },
        bottom: BorderSide {
            width: b.border_bottom_width.to_f32_px(),
            color: extract_color(&style.clone_border_bottom_color()),
            style: map_border_style(b.border_bottom_style),
        },
        left: BorderSide {
            width: b.border_left_width.to_f32_px(),
            color: extract_color(&style.clone_border_left_color()),
            style: map_border_style(b.border_left_style),
        },
    }
}

/// Extract CSS `border-image` properties (Chromium: NinePieceImage).
///
/// Returns `Some(BorderImage)` when `border-image-source` is set to a
/// non-none value. The source image URL is extracted the same way as
/// `background-image: url()` — via `GenericImage::Url` / `ComputedUrl`.
fn extract_border_image(style: &ComputedValues, current_color: CGColor) -> Option<BorderImage> {
    let b = style.get_border();

    let source = convert_image(&b.border_image_source, current_color)?;

    // border-image-slice: BorderImageSlice { offsets: Rect<NonNegative<NumberOrPercentage>>, fill }
    let slice_computed = &b.border_image_slice;
    let s = &slice_computed.offsets;
    let resolve_nop = |v: &style::values::computed::NonNegativeNumberOrPercentage| -> f32 {
        use style::values::computed::NumberOrPercentage;
        match &v.0 {
            NumberOrPercentage::Number(n) => *n,
            NumberOrPercentage::Percentage(p) => p.0 * 100.0,
        }
    };
    let slice = EdgeInsets {
        top: resolve_nop(&s.0),
        right: resolve_nop(&s.1),
        bottom: resolve_nop(&s.2),
        left: resolve_nop(&s.3),
    };

    // border-image-outset: Rect<NonNegativeLengthOrNumber>
    let o = &b.border_image_outset;
    let resolve_lon = |v: &style::values::computed::NonNegativeLengthOrNumber| -> f32 {
        use style::values::generics::length::GenericLengthOrNumber;
        match v {
            GenericLengthOrNumber::Number(n) => n.0,
            GenericLengthOrNumber::Length(lp) => lp.0.px(),
        }
    };
    let outset = EdgeInsets {
        top: resolve_lon(&o.0),
        right: resolve_lon(&o.1),
        bottom: resolve_lon(&o.2),
        left: resolve_lon(&o.3),
    };

    // border-image-repeat: (keyword_x, keyword_y)
    let repeat = &b.border_image_repeat;
    let map_repeat =
        |kw: &style::values::specified::border::BorderImageRepeatKeyword| -> types::BorderImageRepeat {
            use style::values::specified::border::BorderImageRepeatKeyword as BIR;
            match kw {
                BIR::Stretch => types::BorderImageRepeat::Stretch,
                BIR::Repeat => types::BorderImageRepeat::Repeat,
                BIR::Round => types::BorderImageRepeat::Round,
                BIR::Space => types::BorderImageRepeat::Space,
            }
        };

    // border-image-width: Rect<BorderImageSideWidth>
    // Number(n) is a multiplier of the corresponding border-width.
    // LengthPercentage is an absolute value. Auto = use slice value.
    let biw = &b.border_image_width;
    let border_widths = [
        b.border_top_width.to_f32_px(),
        b.border_right_width.to_f32_px(),
        b.border_bottom_width.to_f32_px(),
        b.border_left_width.to_f32_px(),
    ];
    let resolve_bisw =
        |v: &style::values::computed::BorderImageSideWidth, border_w: f32| -> Option<f32> {
            use style::values::generics::border::BorderImageSideWidth as BISW;
            match v {
                BISW::Number(n) => Some(n.0 * border_w),
                BISW::LengthPercentage(lp) => Some(lp.0.to_length().map(|l| l.px()).unwrap_or(0.0)),
                BISW::Auto => None,
            }
        };
    let width = {
        let t = resolve_bisw(&biw.0, border_widths[0]);
        let r = resolve_bisw(&biw.1, border_widths[1]);
        let bv = resolve_bisw(&biw.2, border_widths[2]);
        let l = resolve_bisw(&biw.3, border_widths[3]);
        if t.is_some() || r.is_some() || bv.is_some() || l.is_some() {
            Some(EdgeInsets {
                top: t.unwrap_or(0.0),
                right: r.unwrap_or(0.0),
                bottom: bv.unwrap_or(0.0),
                left: l.unwrap_or(0.0),
            })
        } else {
            None
        }
    };

    Some(BorderImage {
        source,
        slice,
        fill: slice_computed.fill,
        width,
        outset,
        repeat_x: map_repeat(&repeat.0),
        repeat_y: map_repeat(&repeat.1),
    })
}

/// Extract CSS `outline` properties.
///
/// Chromium: `ComputedStyle::OutlineWidth()`, `OutlineColor()`,
/// `OutlineStyle()`, `OutlineOffset()`.
fn extract_outline(style: &ComputedValues) -> Outline {
    let o = style.get_outline();

    if !o.outline_has_nonzero_width() {
        return Outline::default();
    }

    // outline-style: Auto | BorderStyle(bs)
    let outline_style = {
        use style::values::computed::OutlineStyle;
        match o.outline_style {
            OutlineStyle::Auto => types::BorderStyle::Solid, // auto → solid for our purposes
            OutlineStyle::BorderStyle(bs) => map_border_style(bs),
        }
    };

    if outline_style == types::BorderStyle::None {
        return Outline::default();
    }

    // outline-color defaults to currentcolor per CSS spec
    let color = o
        .outline_color
        .as_absolute()
        .map(abs_color_to_cg)
        .unwrap_or_else(|| abs_color_to_cg(&style.get_inherited_text().color));

    Outline {
        width: o.outline_width.to_f32_px(),
        color,
        style: outline_style,
        offset: o.outline_offset.to_f32_px(),
    }
}

/// Convert a Stylo `GenericImage` to our `StyleImage`.
///
/// Shared by `extract_background` and `extract_border_image` — both need
/// the same URL/gradient conversion from Stylo's computed image type.
fn convert_image(
    image: &style::values::computed::Image,
    current_color: CGColor,
) -> Option<StyleImage> {
    use style::values::computed::url::ComputedUrl;
    use style::values::generics::image::{GenericGradient, GenericImage};

    match image {
        GenericImage::None => None,
        GenericImage::Url(computed_url) => {
            let url_str = match computed_url {
                ComputedUrl::Valid(url) => url.as_str().to_string(),
                ComputedUrl::Invalid(s) => s.to_string(),
            };
            if url_str.is_empty() {
                None
            } else {
                Some(StyleImage::Url(url_str))
            }
        }
        GenericImage::Gradient(gradient) => match gradient.as_ref() {
            GenericGradient::Linear {
                direction,
                items,
                flags,
                color_interpolation_method,
                ..
            } => {
                let stops = gradient_items_to_stops(items, current_color);
                if stops.is_empty() {
                    return None;
                }
                let angle_deg = extract_gradient_angle(direction);
                Some(StyleImage::LinearGradient(LinearGradient {
                    angle_deg,
                    stops,
                    repeating: is_repeating(flags),
                    interpolation: extract_gradient_interpolation(color_interpolation_method),
                }))
            }
            GenericGradient::Radial {
                shape,
                position,
                items,
                flags,
                color_interpolation_method,
                ..
            } => {
                let stops = gradient_items_to_stops(items, current_color);
                if stops.is_empty() {
                    return None;
                }
                let (rshape, rsize) = extract_radial_shape(shape);
                Some(StyleImage::RadialGradient(RadialGradient {
                    shape: rshape,
                    size: rsize,
                    center: extract_gradient_position(position),
                    stops,
                    repeating: is_repeating(flags),
                    interpolation: extract_gradient_interpolation(color_interpolation_method),
                }))
            }
            GenericGradient::Conic {
                angle,
                position,
                items,
                flags,
                color_interpolation_method,
                ..
            } => {
                let stops = conic_gradient_items_to_stops(items, current_color);
                if stops.is_empty() {
                    return None;
                }
                Some(StyleImage::ConicGradient(ConicGradient {
                    from_angle_deg: angle.degrees(),
                    center: extract_gradient_position(position),
                    stops,
                    repeating: is_repeating(flags),
                    interpolation: extract_gradient_interpolation(color_interpolation_method),
                }))
            }
        },
        _ => None,
    }
}

fn extract_gradient_interpolation(
    m: &style::color::mix::ColorInterpolationMethod,
) -> GradientInterpolation {
    use style::color::mix::HueInterpolationMethod as HIM;
    use style::color::ColorSpace as CS;
    let color_space = match m.space {
        CS::Srgb => GradientColorSpace::Srgb,
        CS::SrgbLinear => GradientColorSpace::SrgbLinear,
        CS::Hsl => GradientColorSpace::Hsl,
        CS::Hwb => GradientColorSpace::Hwb,
        CS::Lab => GradientColorSpace::Lab,
        CS::Lch => GradientColorSpace::Lch,
        CS::Oklab => GradientColorSpace::Oklab,
        CS::Oklch => GradientColorSpace::Oklch,
        CS::DisplayP3 => GradientColorSpace::DisplayP3,
        CS::Rec2020 => GradientColorSpace::Rec2020,
        CS::A98Rgb => GradientColorSpace::A98Rgb,
        CS::ProphotoRgb => GradientColorSpace::ProphotoRgb,
        CS::XyzD50 => GradientColorSpace::XyzD50,
        CS::XyzD65 => GradientColorSpace::XyzD65,
        // Skia has no linear display-p3; fall back to display-p3 (gamma-encoded).
        CS::DisplayP3Linear => GradientColorSpace::DisplayP3,
    };
    // Stylo's `Specified` has no Skia equivalent; map to Shorter (the default
    // and what CSS Color 4 falls back to in most contexts).
    let hue_method = match m.hue {
        HIM::Shorter | HIM::Specified => GradientHueMethod::Shorter,
        HIM::Longer => GradientHueMethod::Longer,
        HIM::Increasing => GradientHueMethod::Increasing,
        HIM::Decreasing => GradientHueMethod::Decreasing,
    };
    GradientInterpolation {
        color_space,
        hue_method,
    }
}

fn extract_border_radius(style: &ComputedValues) -> CornerRadii {
    let b = style.get_border();
    // Returns (px, percent_fraction). Percent is deferred to paint time,
    // where the border-box w/h is known (CSS Backgrounds 3 §5.3).
    let lp = |v: &style::values::computed::NonNegativeLengthPercentage| -> (f32, f32) {
        match length_percentage_to_css(&v.0) {
            CssLength::Px(p) => (p, 0.0),
            CssLength::Percent(p) => (0.0, p),
            CssLength::Calc { px, percent } => (px, percent),
            CssLength::Auto => (0.0, 0.0),
        }
    };
    let (tl_x, tl_x_pct) = lp(&b.border_top_left_radius.0.width);
    let (tl_y, tl_y_pct) = lp(&b.border_top_left_radius.0.height);
    let (tr_x, tr_x_pct) = lp(&b.border_top_right_radius.0.width);
    let (tr_y, tr_y_pct) = lp(&b.border_top_right_radius.0.height);
    let (br_x, br_x_pct) = lp(&b.border_bottom_right_radius.0.width);
    let (br_y, br_y_pct) = lp(&b.border_bottom_right_radius.0.height);
    let (bl_x, bl_x_pct) = lp(&b.border_bottom_left_radius.0.width);
    let (bl_y, bl_y_pct) = lp(&b.border_bottom_left_radius.0.height);
    CornerRadii {
        tl_x,
        tl_y,
        tr_x,
        tr_y,
        br_x,
        br_y,
        bl_x,
        bl_y,
        tl_x_pct,
        tl_y_pct,
        tr_x_pct,
        tr_y_pct,
        br_x_pct,
        br_y_pct,
        bl_x_pct,
        bl_y_pct,
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

fn extract_inset(style: &ComputedValues) -> CssEdgeInsets {
    fn extract_side(v: style::values::computed::Inset) -> CssLength {
        use style::values::computed::Inset;
        match v {
            Inset::Auto => CssLength::Auto,
            Inset::LengthPercentage(lp) => {
                if let Some(len) = lp.to_length() {
                    CssLength::Px(len.px())
                } else if let Some(pct) = lp.to_percentage() {
                    CssLength::Percent(pct.0)
                } else {
                    CssLength::Auto
                }
            }
            // Anchor positioning — not supported, fall back to auto.
            _ => CssLength::Auto,
        }
    }
    CssEdgeInsets {
        top: extract_side(style.clone_top()),
        right: extract_side(style.clone_right()),
        bottom: extract_side(style.clone_bottom()),
        left: extract_side(style.clone_left()),
    }
}

fn extract_background(style: &ComputedValues, current_color: CGColor) -> Vec<BackgroundLayer> {
    let bg = style.get_background();
    let mut layers: Vec<BackgroundLayer> = Vec::new();

    // 1. Background color (bottom layer). Per CSS Backgrounds 3 §2.5 the
    //    color uses the `background-clip` value from the *final* layer
    //    entry in the list.
    if let Some(abs) = bg.background_color.as_absolute() {
        let c = abs_color_to_cg(abs);
        if c.a > 0 {
            let color_clip = bg
                .background_clip
                .0
                .last()
                .map(extract_bg_clip)
                .unwrap_or(BackgroundBox::BorderBox);
            layers.push(BackgroundLayer::Solid {
                color: c,
                clip: color_clip,
            });
        }
    }

    // 2. Background image layers (gradients and URL images on top of
    //    the color). CSS paints the FIRST image in source order on top
    //    of the stack — later images sit underneath. We iterate in
    //    reverse source order so the resulting `layers` vector is
    //    bottom-to-top, matching the paint-phase iteration.
    //    CSS cycles shorter per-layer longhands to match the image count.
    let cycle = |n: usize, i: usize| -> usize {
        if n == 0 {
            0
        } else {
            i % n
        }
    };
    let sizes = &bg.background_size.0;
    let px = &bg.background_position_x.0;
    let py = &bg.background_position_y.0;
    let reps = &bg.background_repeat.0;
    let clips = &bg.background_clip.0;
    let origins = &bg.background_origin.0;

    for (i, image) in bg.background_image.0.iter().enumerate().rev() {
        let Some(source) = convert_image(image, current_color) else {
            continue;
        };
        let size = sizes
            .get(cycle(sizes.len(), i))
            .map(extract_bg_size)
            .unwrap_or_default();
        let position = BackgroundPosition {
            x: px
                .get(cycle(px.len(), i))
                .map(length_percentage_to_css)
                .unwrap_or(CssLength::Percent(0.0)),
            y: py
                .get(cycle(py.len(), i))
                .map(length_percentage_to_css)
                .unwrap_or(CssLength::Percent(0.0)),
        };
        let repeat = reps
            .get(cycle(reps.len(), i))
            .map(extract_bg_repeat)
            .unwrap_or_default();
        let clip = clips
            .get(cycle(clips.len(), i))
            .map(extract_bg_clip)
            .unwrap_or(BackgroundBox::BorderBox);
        let origin = origins
            .get(cycle(origins.len(), i))
            .map(extract_bg_origin)
            .unwrap_or(BackgroundBox::PaddingBox);

        layers.push(BackgroundLayer::Image(BackgroundImage {
            source,
            size,
            position,
            repeat,
            clip,
            origin,
        }));
    }

    layers
}

fn extract_bg_size(sz: &style::values::computed::BackgroundSize) -> BackgroundSize {
    use style::values::generics::background::BackgroundSize as G;
    use style::values::generics::length::GenericLengthPercentageOrAuto as LPA;
    match sz {
        G::Cover => BackgroundSize::Cover,
        G::Contain => BackgroundSize::Contain,
        G::ExplicitSize { width, height } => {
            let to_len =
                |v: &LPA<style::values::computed::NonNegativeLengthPercentage>| -> CssLength {
                    match v {
                        LPA::Auto => CssLength::Auto,
                        LPA::LengthPercentage(lp) => length_percentage_to_css(&lp.0),
                    }
                };
            let w = to_len(width);
            let h = to_len(height);
            // Canonicalize the initial value — `auto auto` → `Auto`.
            if matches!((w, h), (CssLength::Auto, CssLength::Auto)) {
                BackgroundSize::Auto
            } else {
                BackgroundSize::Explicit {
                    width: w,
                    height: h,
                }
            }
        }
    }
}

fn extract_bg_repeat(
    r: &style::properties::longhands::background_repeat::single_value::computed_value::T,
) -> BackgroundRepeat {
    // Stylo's BackgroundRepeat is `(Keyword, Keyword)`.
    use style::values::specified::background::BackgroundRepeatKeyword as K;
    let map = |k: K| -> BackgroundRepeatKeyword {
        match k {
            K::Repeat => BackgroundRepeatKeyword::Repeat,
            K::NoRepeat => BackgroundRepeatKeyword::NoRepeat,
            K::Space => BackgroundRepeatKeyword::Space,
            K::Round => BackgroundRepeatKeyword::Round,
        }
    };
    BackgroundRepeat {
        x: map(r.0),
        y: map(r.1),
    }
}

fn extract_bg_clip(
    v: &style::properties::longhands::background_clip::single_value::computed_value::T,
) -> BackgroundBox {
    use style::properties::longhands::background_clip::single_value::computed_value::T;
    match v {
        T::BorderBox => BackgroundBox::BorderBox,
        T::PaddingBox => BackgroundBox::PaddingBox,
        T::ContentBox => BackgroundBox::ContentBox,
    }
}

fn extract_bg_origin(
    v: &style::properties::longhands::background_origin::single_value::computed_value::T,
) -> BackgroundBox {
    use style::properties::longhands::background_origin::single_value::computed_value::T;
    match v {
        T::BorderBox => BackgroundBox::BorderBox,
        T::PaddingBox => BackgroundBox::PaddingBox,
        T::ContentBox => BackgroundBox::ContentBox,
    }
}

fn is_repeating(flags: &style::values::generics::image::GradientFlags) -> bool {
    use style::values::generics::image::GradientFlags;
    flags.contains(GradientFlags::REPEATING)
}

/// Convert Stylo's ending shape (radial shape + size) into our split form.
fn extract_radial_shape(
    shape: &style::values::computed::image::EndingShape,
) -> (RadialShape, RadialSize) {
    use style::values::computed::image::EndingShape;
    use style::values::generics::image::{Circle, Ellipse, ShapeExtent};

    fn size_from_extent(e: ShapeExtent) -> RadialSize {
        match e {
            ShapeExtent::ClosestSide | ShapeExtent::Contain => RadialSize::ClosestSide,
            ShapeExtent::ClosestCorner => RadialSize::ClosestCorner,
            ShapeExtent::FarthestSide => RadialSize::FarthestSide,
            ShapeExtent::FarthestCorner | ShapeExtent::Cover => RadialSize::FarthestCorner,
        }
    }

    match shape {
        EndingShape::Circle(c) => {
            let size = match c {
                Circle::Radius(r) => {
                    let px = r.0.px();
                    RadialSize::Explicit {
                        x: CssLength::Px(px),
                        y: CssLength::Px(px),
                    }
                }
                Circle::Extent(e) => size_from_extent(*e),
            };
            (RadialShape::Circle, size)
        }
        EndingShape::Ellipse(e) => {
            let size = match e {
                Ellipse::Radii(rx, ry) => RadialSize::Explicit {
                    x: length_percentage_to_css(&rx.0),
                    y: length_percentage_to_css(&ry.0),
                },
                Ellipse::Extent(ex) => size_from_extent(*ex),
            };
            (RadialShape::Ellipse, size)
        }
    }
}

fn extract_gradient_position(pos: &style::values::computed::Position) -> GradientPosition {
    GradientPosition {
        x: length_percentage_to_css(&pos.horizontal),
        y: length_percentage_to_css(&pos.vertical),
    }
}

/// Map a Stylo `LengthPercentage` → our `CssLength`.
///
/// For mixed `calc()` values (e.g. `calc(100% - 10px)`), both `to_length`
/// and `to_percentage` return `None`. We decompose by probing `resolve()`
/// at two known bases: `resolve(0)` yields the pure px term, and
/// `(resolve(100) - resolve(0)) / 100` yields the percent coefficient.
fn length_percentage_to_css(lp: &style::values::computed::LengthPercentage) -> CssLength {
    if let Some(len) = lp.to_length() {
        return CssLength::Px(len.px());
    }
    if let Some(pct) = lp.to_percentage() {
        return CssLength::Percent(pct.0);
    }
    use style::values::computed::Length;
    let at_zero = lp.resolve(Length::new(0.0)).px();
    let at_hundred = lp.resolve(Length::new(100.0)).px();
    let percent = (at_hundred - at_zero) / 100.0;
    CssLength::Calc {
        px: at_zero,
        percent,
    }
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
///
/// `currentcolor` stops (unresolvable to absolute) resolve to `current_color`
/// (the element's computed `color`), per CSS Color 3 §4.4.
fn gradient_items_to_stops(
    items: &[style::values::generics::image::GenericGradientItem<
        style::values::computed::Color,
        style::values::computed::LengthPercentage,
    >],
    current_color: CGColor,
) -> Vec<GradientStop> {
    use style::values::generics::image::GenericGradientItem;

    let resolve = |color: &style::values::computed::Color| -> CGColor {
        color
            .as_absolute()
            .map(abs_color_to_cg)
            .unwrap_or(current_color)
    };

    // Each element: (position, is_px, color). Px-positioned stops are
    // normalized to gradient-line fractions at paint time where the line
    // length is known.
    let mut raw: Vec<(Option<f32>, bool, CGColor)> = Vec::new();
    for item in items {
        match item {
            GenericGradientItem::SimpleColorStop(color) => {
                raw.push((None, false, resolve(color)));
            }
            GenericGradientItem::ComplexColorStop { color, position } => {
                let (offset, is_px) = if let Some(pct) = position.to_percentage() {
                    (Some(pct.0), false)
                } else if let Some(len) = position.to_length() {
                    (Some(len.px()), true)
                } else {
                    (None, false)
                };
                raw.push((offset, is_px, resolve(color)));
            }
            GenericGradientItem::InterpolationHint(_) => {}
        }
    }
    auto_distribute_stops_typed(&mut raw);
    raw.into_iter()
        .map(|(o, is_px, c)| GradientStop {
            offset: o.unwrap_or(0.0),
            offset_is_px: is_px,
            color: c,
        })
        .collect()
}

/// Like `auto_distribute_stops`, but carries an `is_px` flag per stop.
///
/// First and last auto stops default to `0%` and `100%` respectively. Interior
/// runs of auto stops are linearly interpolated between their bookends. When
/// bookends use different units we inherit the previous stop's unit; exact
/// resolution defers to paint-time which has the gradient-line length.
fn auto_distribute_stops_typed(raw: &mut [(Option<f32>, bool, CGColor)]) {
    let n = raw.len();
    if n == 0 {
        return;
    }
    if raw[0].0.is_none() {
        raw[0].0 = Some(0.0);
        raw[0].1 = false;
    }
    if raw[n - 1].0.is_none() {
        raw[n - 1].0 = Some(1.0);
        raw[n - 1].1 = false;
    }
    let mut i = 1;
    while i < n - 1 {
        if raw[i].0.is_some() {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        while j < n && raw[j].0.is_none() {
            j += 1;
        }
        let prev = raw[i - 1].0.unwrap();
        let next = raw[j].0.unwrap();
        let prev_is_px = raw[i - 1].1;
        let next_is_px = raw[j].1;
        if prev_is_px == next_is_px {
            // Same-unit run: interpolate linearly in the bookend unit.
            let count = (j - i + 1) as f32;
            for (k, slot) in (i..j).enumerate() {
                let t = (k + 1) as f32 / count;
                raw[slot].0 = Some(prev + t * (next - prev));
                raw[slot].1 = prev_is_px;
            }
        } else {
            // Mixed-unit run (e.g. `10px`…`100%`). Raw linear interpolation
            // of the numeric values mixes px and fraction units and
            // produces nonsense (a fraction-space halfway of `10px`/`100%`
            // is not `55px`). Until we carry stops as a unit-tagged
            // calc-like representation all the way to paint time, snap
            // every interior auto stop to the previous bookend's position.
            // This keeps CSS's non-decreasing ordering rule and degrades
            // to a hard color transition at `prev` rather than placing
            // the interior stops at incorrect numeric positions.
            for entry in raw.iter_mut().take(j).skip(i) {
                entry.0 = Some(prev);
                entry.1 = prev_is_px;
            }
        }
        i = j;
    }
}

/// Convert conic-gradient items to GradientStops.
///
/// `currentcolor` stops resolve to `current_color`; see
/// `gradient_items_to_stops` for details.
fn conic_gradient_items_to_stops(
    items: &[style::values::generics::image::GenericGradientItem<
        style::values::computed::Color,
        style::values::computed::AngleOrPercentage,
    >],
    current_color: CGColor,
) -> Vec<GradientStop> {
    use style::values::computed::AngleOrPercentage;
    use style::values::generics::image::GenericGradientItem;

    let resolve = |color: &style::values::computed::Color| -> CGColor {
        color
            .as_absolute()
            .map(abs_color_to_cg)
            .unwrap_or(current_color)
    };

    let mut raw: Vec<(Option<f32>, CGColor)> = Vec::new();
    for item in items {
        match item {
            GenericGradientItem::SimpleColorStop(color) => {
                raw.push((None, resolve(color)));
            }
            GenericGradientItem::ComplexColorStop { color, position } => {
                let offset = match position {
                    AngleOrPercentage::Percentage(p) => Some(p.0),
                    AngleOrPercentage::Angle(a) => Some(a.degrees() / 360.0),
                };
                raw.push((offset, resolve(color)));
            }
            GenericGradientItem::InterpolationHint(_) => {}
        }
    }
    auto_distribute_stops(&mut raw);
    raw.into_iter()
        .map(|(o, c)| GradientStop {
            offset: o.unwrap_or(0.0),
            offset_is_px: false,
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

fn extract_box_shadow(style: &ComputedValues, current_color: CGColor) -> Vec<BoxShadow> {
    let shadows = style.clone_box_shadow();
    shadows
        .0
        .iter()
        .map(|s| {
            // Per CSS, omitted or `currentcolor` shadows resolve to the
            // element's computed `color`, not opaque black.
            let color = s
                .base
                .color
                .as_absolute()
                .map(abs_color_to_cg)
                .unwrap_or(current_color);
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

fn extract_clip_path(style: &ComputedValues) -> ClipPath {
    use style::values::computed::basic_shape::ClipPath as ComputedClipPath;
    use style::values::generics::basic_shape::{
        FillRule, GenericBasicShape, GenericClipPath, GenericShapeRadius,
    };
    use style::values::generics::position::GenericPositionOrAuto;

    let cp: ComputedClipPath = style.clone_clip_path();
    match cp {
        GenericClipPath::None => ClipPath::None,
        GenericClipPath::Url(_) => ClipPath::None,
        GenericClipPath::Box(_) => ClipPath::None,
        GenericClipPath::Shape(shape, _) => {
            let resolve_pos = |p: &GenericPositionOrAuto<
                style::values::computed::Position,
            >| -> (CssLength, CssLength) {
                match p {
                    GenericPositionOrAuto::Position(pos) => (
                        length_percentage_to_css(&pos.horizontal),
                        length_percentage_to_css(&pos.vertical),
                    ),
                    // `at auto` means center per spec.
                    GenericPositionOrAuto::Auto => {
                        (CssLength::Percent(0.5), CssLength::Percent(0.5))
                    }
                }
            };
            let resolve_radius = |r: &GenericShapeRadius<
                style::values::computed::NonNegativeLengthPercentage,
            >|
             -> ShapeRadius {
                match r {
                    GenericShapeRadius::Length(lp) => {
                        ShapeRadius::Length(length_percentage_to_css(&lp.0))
                    }
                    GenericShapeRadius::ClosestSide => ShapeRadius::ClosestSide,
                    GenericShapeRadius::FarthestSide => ShapeRadius::FarthestSide,
                }
            };
            match *shape {
                GenericBasicShape::Rect(inset) => {
                    let sides = &inset.rect;
                    ClipPath::Inset {
                        top: length_percentage_to_css(&sides.0),
                        right: length_percentage_to_css(&sides.1),
                        bottom: length_percentage_to_css(&sides.2),
                        left: length_percentage_to_css(&sides.3),
                        radius: extract_inset_corner_radii(&inset.round),
                    }
                }
                GenericBasicShape::Circle(circle) => {
                    let (cx, cy) = resolve_pos(&circle.position);
                    ClipPath::Circle {
                        cx,
                        cy,
                        radius: resolve_radius(&circle.radius),
                    }
                }
                GenericBasicShape::Ellipse(ellipse) => {
                    let (cx, cy) = resolve_pos(&ellipse.position);
                    ClipPath::Ellipse {
                        cx,
                        cy,
                        rx: resolve_radius(&ellipse.semiaxis_x),
                        ry: resolve_radius(&ellipse.semiaxis_y),
                    }
                }
                GenericBasicShape::Polygon(poly) => {
                    let points = poly
                        .coordinates
                        .iter()
                        .map(|c| {
                            (
                                length_percentage_to_css(&c.0),
                                length_percentage_to_css(&c.1),
                            )
                        })
                        .collect();
                    ClipPath::Polygon {
                        points,
                        even_odd: matches!(poly.fill, FillRule::Evenodd),
                    }
                }
                GenericBasicShape::PathOrShape(_) => ClipPath::None,
            }
        }
    }
}

/// Map Stylo's `GenericBorderRadius<NonNegativeLengthPercentage>` onto our
/// `CornerRadii`. Percentages stay unresolved — paint time turns them
/// into px against the clip rect's own dimensions.
fn extract_inset_corner_radii(
    radius: &style::values::generics::border::GenericBorderRadius<
        style::values::computed::NonNegativeLengthPercentage,
    >,
) -> InsetCornerRadii {
    // Preserve px vs percent per axis. `clip-path: inset(... round ...)`
    // radii resolve against the inset clip rect at paint time, so we
    // can't flatten percentages to px here.
    let lp = |v: &style::values::computed::LengthPercentage| -> CssLength {
        length_percentage_to_css(v)
    };
    InsetCornerRadii {
        tl_x: lp(&radius.top_left.0.width.0),
        tl_y: lp(&radius.top_left.0.height.0),
        tr_x: lp(&radius.top_right.0.width.0),
        tr_y: lp(&radius.top_right.0.height.0),
        br_x: lp(&radius.bottom_right.0.width.0),
        br_y: lp(&radius.bottom_right.0.height.0),
        bl_x: lp(&radius.bottom_left.0.width.0),
        bl_y: lp(&radius.bottom_left.0.height.0),
    }
}

fn extract_filter(style: &ComputedValues, current_color: CGColor) -> Vec<FilterFunction> {
    use style::values::generics::effects::GenericFilter;
    style
        .clone_filter()
        .0
        .iter()
        .filter_map(|f| match f {
            GenericFilter::Blur(len) => Some(FilterFunction::Blur(len.0.px())),
            GenericFilter::Brightness(n) => Some(FilterFunction::Brightness(n.0)),
            GenericFilter::Contrast(n) => Some(FilterFunction::Contrast(n.0)),
            GenericFilter::Grayscale(n) => Some(FilterFunction::Grayscale(n.0)),
            GenericFilter::HueRotate(a) => Some(FilterFunction::HueRotate(a.radians())),
            GenericFilter::Invert(n) => Some(FilterFunction::Invert(n.0)),
            GenericFilter::Opacity(n) => Some(FilterFunction::Opacity(n.0)),
            GenericFilter::Saturate(n) => Some(FilterFunction::Saturate(n.0)),
            GenericFilter::Sepia(n) => Some(FilterFunction::Sepia(n.0)),
            GenericFilter::DropShadow(s) => {
                // Omitted / `currentcolor` shadow color resolves to the
                // element's computed `color` per CSS Filters §10.4.
                let color = s
                    .color
                    .as_absolute()
                    .map(abs_color_to_cg)
                    .unwrap_or(current_color);
                Some(FilterFunction::DropShadow {
                    offset_x: s.horizontal.px(),
                    offset_y: s.vertical.px(),
                    blur: s.blur.0.px(),
                    color,
                })
            }
            // `Url` (SVG filter refs) not plumbed.
            _ => None,
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

fn extract_font(style: &ComputedValues, current_color: CGColor) -> FontProps {
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

    // Direction (ltr / rtl) — inherited. Affects Skia paragraph base
    // direction for bidi reordering.
    {
        use style::properties::longhands::direction::computed_value::T as StyloDir;
        props.direction = match style.get_inherited_box().clone_direction() {
            StyloDir::Ltr => types::Direction::Ltr,
            StyloDir::Rtl => types::Direction::Rtl,
        };
    }

    // Text align. Logical `start` / `end` keywords resolve against the
    // already-extracted `direction`: in LTR, `start` = left; in RTL,
    // `start` = right.
    use style::values::specified::text::TextAlignKeyword;
    let (logical_start, logical_end) = match props.direction {
        types::Direction::Ltr => (TextAlign::Left, TextAlign::Right),
        types::Direction::Rtl => (TextAlign::Right, TextAlign::Left),
    };
    props.text_align = match inherited_text.text_align {
        TextAlignKeyword::Start => logical_start,
        TextAlignKeyword::End => logical_end,
        TextAlignKeyword::Left | TextAlignKeyword::MozLeft => TextAlign::Left,
        TextAlignKeyword::Right | TextAlignKeyword::MozRight => TextAlign::Right,
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

    // text-decoration-style: solid|double|dotted|dashed|wavy (MozNone → Solid).
    {
        use style::properties::longhands::text_decoration_style::computed_value::T as TDS;
        props.decoration_style = match style.clone_text_decoration_style() {
            TDS::Solid | TDS::MozNone => TextDecorationStyle::Solid,
            TDS::Double => TextDecorationStyle::Double,
            TDS::Dotted => TextDecorationStyle::Dotted,
            TDS::Dashed => TextDecorationStyle::Dashed,
            TDS::Wavy => TextDecorationStyle::Wavy,
        };
    }

    // text-decoration-color: `currentcolor` (unresolvable to absolute) stays
    // None and paint falls back to the element's text color.
    props.decoration_color = style
        .clone_text_decoration_color()
        .as_absolute()
        .map(abs_color_to_cg);

    // text-shadow: inherited list. Stylo gives us resolved absolute colors
    // (falling back to currentcolor resolved against text color).
    props.text_shadow = style
        .clone_text_shadow()
        .0
        .iter()
        .map(|s| {
            // CSS Text Decoration §3: `text-shadow` defaults to and
            // `currentcolor` resolves to the element's computed `color`.
            let color = s
                .color
                .as_absolute()
                .map(abs_color_to_cg)
                .unwrap_or(current_color);
            TextShadow {
                offset_x: s.horizontal.px(),
                offset_y: s.vertical.px(),
                blur: s.blur.0.px(),
                color,
            }
        })
        .collect();

    // text-indent: first-line inline-start indent. `hanging` / `each-line`
    // modifier keywords are not honored — we apply indent only to the
    // first visual line of the first paragraph, matching the common case.
    {
        let ti = style.clone_text_indent();
        props.text_indent = length_percentage_to_css(&ti.length);
    }

    // image-rendering: quality hint for raster images.
    {
        use style::values::specified::image::ImageRendering as IR;
        props.image_rendering = match style.clone_image_rendering() {
            IR::CrispEdges => types::ImageRendering::CrispEdges,
            IR::Pixelated => types::ImageRendering::Pixelated,
            _ => types::ImageRendering::Auto,
        };
    }

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
    use style::values::generics::transform::{
        GenericRotate as Rotate, GenericScale as Scale, GenericTranslate as Translate,
    };
    use types::{LengthPercentage as LP, TransformOp};

    let bx = style.get_box();
    let transform = bx.clone_transform();
    let ops = &transform.0;

    let resolve_lp = |lp: &style::values::computed::LengthPercentage| -> LP {
        if let Some(pct) = lp.to_percentage() {
            LP::Percent(pct.0)
        } else if let Some(len) = lp.to_length() {
            LP::Px(len.px())
        } else {
            LP::Px(0.0)
        }
    };

    let mut result: Vec<TransformOp> = Vec::with_capacity(ops.len() + 3);

    // CSS Transforms 2: individual transform properties apply first, in the
    // order translate → rotate → scale, then the `transform` shorthand.
    // https://drafts.csswg.org/css-transforms-2/#individual-transforms
    match bx.clone_translate() {
        Translate::None => {}
        Translate::Translate(tx, ty, _tz) => {
            result.push(TransformOp::Translate(resolve_lp(&tx), resolve_lp(&ty)));
        }
    }
    match bx.clone_rotate() {
        Rotate::None => {}
        Rotate::Rotate(angle) => {
            result.push(TransformOp::Rotate(angle.radians()));
        }
        // 3D rotate: only honor if the rotation axis is close to the Z axis (0,0,z).
        Rotate::Rotate3D(x, y, z, angle) => {
            if x == 0.0 && y == 0.0 && z != 0.0 {
                let radians = angle.radians();
                let signed = if z > 0.0 { radians } else { -radians };
                result.push(TransformOp::Rotate(signed));
            }
        }
    }
    match bx.clone_scale() {
        Scale::None => {}
        Scale::Scale(sx, sy, _sz) => {
            result.push(TransformOp::Scale(sx, sy));
        }
    }

    if ops.is_empty() && result.is_empty() {
        return Vec::new();
    }

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

fn align_flags_to_items(flags: style::values::specified::align::AlignFlags) -> types::AlignItems {
    // NOTE: the caller is expected to pass the keyword-only portion of
    // the flags (i.e. already through `AlignFlags::value()`), which
    // masks off `safe`/`unsafe`/`legacy` modifier bits. The keyword
    // enum is stored in the lower 5 bits as a packed integer (not as
    // independent bits), so `==` is the right comparison — `contains()`
    // would wrongly report e.g. `SPACE_BETWEEN` as containing `CENTER`
    // because their bit patterns overlap.
    use style::values::specified::align::AlignFlags;
    match flags {
        f if f == AlignFlags::CENTER => types::AlignItems::Center,
        f if f == AlignFlags::FLEX_START || f == AlignFlags::START => types::AlignItems::Start,
        f if f == AlignFlags::FLEX_END || f == AlignFlags::END => types::AlignItems::End,
        f if f == AlignFlags::BASELINE => types::AlignItems::Baseline,
        _ => types::AlignItems::Stretch,
    }
}

/// Map align/justify flags to an optional `JustifyContent`. Returns
/// `None` for values that should defer to the layout method's default
/// (`normal`, `stretch`, and anything else unrecognized). Used by
/// `align-content` where the CSS default is "behaves like stretch",
/// not "pack to start".
fn align_flags_to_explicit_justify(
    flags: style::values::specified::align::AlignFlags,
) -> Option<types::JustifyContent> {
    // See `align_flags_to_items` — caller passes keyword-only flags
    // (post `.value()`); use `==` rather than `contains()` because the
    // low-5-bit keyword values overlap bitwise.
    use style::values::specified::align::AlignFlags;
    match flags {
        f if f == AlignFlags::CENTER => Some(types::JustifyContent::Center),
        f if f == AlignFlags::FLEX_START || f == AlignFlags::START => {
            Some(types::JustifyContent::Start)
        }
        f if f == AlignFlags::FLEX_END || f == AlignFlags::END => Some(types::JustifyContent::End),
        f if f == AlignFlags::SPACE_BETWEEN => Some(types::JustifyContent::SpaceBetween),
        f if f == AlignFlags::SPACE_AROUND => Some(types::JustifyContent::SpaceAround),
        f if f == AlignFlags::SPACE_EVENLY => Some(types::JustifyContent::SpaceEvenly),
        _ => None,
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
        (srgb.components.0.clamp(0.0, 1.0) * 255.0).round() as u8,
        (srgb.components.1.clamp(0.0, 1.0) * 255.0).round() as u8,
        (srgb.components.2.clamp(0.0, 1.0) * 255.0).round() as u8,
        (srgb.alpha.clamp(0.0, 1.0) * 255.0).round() as u8,
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
