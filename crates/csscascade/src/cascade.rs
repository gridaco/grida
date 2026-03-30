//! CSS cascade driver.
//!
//! Orchestrates Stylo to resolve computed styles for every element in a
//! [`DemoDom`].  The driver:
//!
//! 1. Collects author CSS from `<style>` elements in the DOM.
//! 2. Builds a [`Stylist`] with those stylesheets.
//! 3. Walks the element tree calling [`resolve_style`] on each element.
//!
//! After [`CascadeDriver::style_document`] returns, every element node carries
//! its [`ElementData`] with fully computed [`ComputedValues`].

use euclid::{Scale, Size2D};
use markup5ever::interface::tree_builder::QuirksMode as HtmlQuirksMode;
use style::context::{
    RegisteredSpeculativePainter, RegisteredSpeculativePainters, SharedStyleContext, StyleContext,
    StyleSystemOptions, ThreadLocalStyleContext,
};
use style::dom::TElement;
use style::font_metrics::FontMetrics;
use style::media_queries::{MediaList, MediaType};
use style::properties::ComputedValues;
use style::properties::style_structs::Font;
use style::queries::values::PrefersColorScheme;
use style::servo::animation::DocumentAnimationSet;
use style::servo::media_queries::{Device, FontMetricsProvider};
use style::servo::selector_parser::SnapshotMap;
use style::servo_arc::Arc as ServoArc;
use style::shared_lock::{SharedRwLock, SharedRwLockReadGuard, StylesheetGuards};
use style::stylesheets::{AllowImportRules, DocumentStyleSheet, Origin, Stylesheet, UrlExtraData};
use style::stylist::{RuleInclusion, Stylist};
use style::traversal::resolve_style;
use style::traversal_flags::TraversalFlags;
use style::values::computed::font::GenericFontFamily;
use style::values::computed::{CSSPixelLength, Length};
use style::values::specified::font::QueryFontMetricsFlags;
use style_traits::{CSSPixel, DevicePixel};
use stylo_atoms::Atom;
use url::Url;

use crate::adapter::{self, HtmlDocument, HtmlElement};
use crate::dom::{DemoDom, DemoNodeData};

/// Default author CSS injected when the document has no `<style>` blocks.
const FALLBACK_AUTHOR_CSS: &str = r#"
html, body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 0;
  padding: 0;
}
body {
  color: #111;
  background: #fff;
}
"#;

/// Minimal User-Agent stylesheet for HTML elements.
///
/// Based on the WHATWG rendering spec defaults:
/// <https://html.spec.whatwg.org/multipage/rendering.html>
///
/// This is intentionally kept compact — only the most common elements and
/// properties that affect layout/cascade behaviour.  It can be extended as
/// needed without breaking anything.
const UA_STYLESHEET: &str = r#"
/* ---- display ---- */
head, link, meta, script, style, title { display: none; }

article, aside, details, div, dt, figcaption, figure,
footer, header, hgroup, main, nav, section, summary {
  display: block;
}

html, body, address, blockquote, center, dialog,
dd, dl, fieldset, form, hr, legend, listing, menu,
ol, p, plaintext, pre, search, ul, xmp {
  display: block;
}

h1, h2, h3, h4, h5, h6 { display: block; }
table { display: table; }
caption { display: table-caption; }
thead { display: table-header-group; }
tbody { display: table-row-group; }
tfoot { display: table-footer-group; }
tr { display: table-row; }
td, th { display: table-cell; }
colgroup { display: table-column-group; }
col { display: table-column; }
li { display: list-item; }
img, video, canvas, svg { display: inline; }

/* ---- margins ---- */
body { margin: 8px; }
p, dl, multicol { margin-block: 1em; }
blockquote, figure, listing, plaintext, pre, xmp {
  margin-block: 1em;
}
h1 { margin-block: 0.67em; }
h2 { margin-block: 0.83em; }
h3 { margin-block: 1em; }
h4 { margin-block: 1.33em; }
h5 { margin-block: 1.67em; }
h6 { margin-block: 2.33em; }
dd { margin-inline-start: 40px; }
blockquote, figure { margin-inline: 40px; }
ul, ol, menu { margin-block: 1em; padding-inline-start: 40px; }

/* ---- headings ---- */
h1 { font-size: 2em; font-weight: bold; }
h2 { font-size: 1.5em; font-weight: bold; }
h3 { font-size: 1.17em; font-weight: bold; }
h4 { font-size: 1em; font-weight: bold; }
h5 { font-size: 0.83em; font-weight: bold; }
h6 { font-size: 0.67em; font-weight: bold; }

/* ---- inline semantics ---- */
b, strong { font-weight: bold; }
i, em, cite, dfn, var { font-style: italic; }
small { font-size: smaller; }
sub { vertical-align: sub; font-size: smaller; }
sup { vertical-align: super; font-size: smaller; }
u, ins { text-decoration: underline; }
s, strike, del { text-decoration: line-through; }
code, kbd, samp, tt { font-family: monospace; }
pre { white-space: pre; font-family: monospace; }

/* ---- table ---- */
table { border-spacing: 2px; border-collapse: separate; }
td, th { padding: 1px; }
th { font-weight: bold; text-align: center; }

/* ---- form ---- */
input, textarea, select, button { font-size: inherit; }

/* ---- misc ---- */
hr {
  display: block;
  border-style: inset;
  border-width: 1px;
  margin-block: 0.5em;
}
a { color: -servo-link; text-decoration: underline; }
"#;

/// Drives the CSS cascade over a parsed DOM.
pub struct CascadeDriver {
    stylist: Stylist,
    stylesheet_lock: SharedRwLock,
    snapshot_map: SnapshotMap,
    animations: DocumentAnimationSet,
    thread_local: Option<ThreadLocalStyleContext<HtmlElement>>,
}

impl CascadeDriver {
    /// Create a new driver, collecting stylesheets from `dom`.
    pub fn new(dom: &DemoDom) -> Self {
        let style_quirks = translate_quirks_mode(dom.quirks_mode());
        let stylesheet_lock = adapter::doc_shared_lock().clone();
        let device = build_device(style_quirks);
        let mut stylist = Stylist::new(device, style_quirks);

        {
            let guard = stylesheet_lock.read();

            // 1. UA stylesheet — default HTML element styles
            let ua_sheet = build_stylesheet(
                UA_STYLESHEET,
                &stylesheet_lock,
                style_quirks,
                Origin::UserAgent,
                "https://grida.local/ua.css",
            );
            stylist.append_stylesheet(ua_sheet, &guard);

            // 2. Author stylesheets — from <style> elements in the document
            let css_blocks = collect_author_styles(dom);
            for css in &css_blocks {
                let sheet = build_stylesheet(
                    css,
                    &stylesheet_lock,
                    style_quirks,
                    Origin::Author,
                    "https://grida.local/inline.css",
                );
                stylist.append_stylesheet(sheet, &guard);
            }
        }

        CascadeDriver {
            stylist,
            stylesheet_lock,
            snapshot_map: SnapshotMap::new(),
            animations: DocumentAnimationSet::default(),
            thread_local: Some(ThreadLocalStyleContext::new()),
        }
    }

    /// Flush the stylist so it picks up all appended sheets.
    pub fn flush(&mut self, document: HtmlDocument) {
        let guard = self.stylesheet_lock.read();
        let guards = StylesheetGuards::same(&guard);
        let _ = self.stylist.flush::<HtmlElement>(
            &guards,
            document.root_element(),
            Some(&self.snapshot_map),
        );
    }

    /// Resolve styles for every element under `document`.
    ///
    /// Returns the number of elements styled.
    pub fn style_document(&mut self, document: HtmlDocument) -> usize {
        let guard = self.stylesheet_lock.read();
        let mut thread_local = self
            .thread_local
            .take()
            .expect("thread-local context should be available");
        let styled = {
            let shared_context = self.shared_style_context(TraversalFlags::empty(), &guard);
            Self::style_subtree(document, &shared_context, &mut thread_local)
        };
        self.thread_local = Some(thread_local);
        styled
    }

    fn shared_style_context<'a>(
        &'a self,
        traversal_flags: TraversalFlags,
        guard: &'a SharedRwLockReadGuard<'a>,
    ) -> SharedStyleContext<'a> {
        SharedStyleContext {
            stylist: &self.stylist,
            visited_styles_enabled: true,
            options: StyleSystemOptions::default(),
            guards: StylesheetGuards::same(guard),
            current_time_for_animations: 0.0,
            traversal_flags,
            snapshot_map: &self.snapshot_map,
            animations: self.animations.clone(),
            registered_speculative_painters: &NOOP_PAINTERS,
        }
    }

    fn style_subtree(
        document: HtmlDocument,
        shared: &SharedStyleContext<'_>,
        thread_local: &mut ThreadLocalStyleContext<HtmlElement>,
    ) -> usize {
        let mut styled = 0;
        let mut stack = Vec::new();
        if let Some(root) = document.root_element() {
            stack.push(root);
        }
        while let Some(element) = stack.pop() {
            Self::style_element(element, shared, thread_local);
            styled += 1;
            let mut child = element.first_element_child();
            while let Some(next_child) = child {
                stack.push(next_child);
                child = next_child.next_element_sibling();
            }
        }
        styled
    }

    fn style_element(
        element: HtmlElement,
        shared: &SharedStyleContext<'_>,
        thread_local: &mut ThreadLocalStyleContext<HtmlElement>,
    ) {
        let mut ctx = StyleContext {
            shared,
            thread_local,
        };
        let styles = resolve_style(&mut ctx, element, RuleInclusion::All, None, None);
        unsafe {
            let mut data = element.ensure_data();
            data.styles = styles;
            data.clear_restyle_flags_and_damage();
        }
    }
}

// ---------------------------------------------------------------------------
// Font metrics stub
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct SimpleFontProvider;

impl FontMetricsProvider for SimpleFontProvider {
    fn query_font_metrics(
        &self,
        _vertical: bool,
        _font: &Font,
        base_size: CSSPixelLength,
        _flags: QueryFontMetricsFlags,
    ) -> FontMetrics {
        let px = base_size.px();
        FontMetrics {
            ascent: Length::new(px * 0.8),
            x_height: Some(Length::new(px * 0.5)),
            cap_height: Some(Length::new(px * 0.7)),
            zero_advance_measure: Some(Length::new(px * 0.5)),
            ic_width: Some(Length::new(px)),
            script_percent_scale_down: None,
            script_script_percent_scale_down: None,
        }
    }

    fn base_size_for_generic(&self, _generic: GenericFontFamily) -> Length {
        Length::new(16.0)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn build_device(quirks: style::context::QuirksMode) -> Device {
    let media_type = MediaType::screen();
    let viewport: Size2D<f32, CSSPixel> = Size2D::new(1280.0, 720.0);
    let dpr: Scale<f32, CSSPixel, DevicePixel> = Scale::new(1.0);
    let font_provider: Box<dyn FontMetricsProvider> = Box::new(SimpleFontProvider);
    let font = Font::initial_values();
    let defaults = ComputedValues::initial_values_with_font_override(font);
    let color_scheme = PrefersColorScheme::Light;
    Device::new(
        media_type,
        quirks,
        viewport,
        dpr,
        font_provider,
        defaults,
        color_scheme,
    )
}

fn build_stylesheet(
    css: &str,
    shared_lock: &SharedRwLock,
    quirks: style::context::QuirksMode,
    origin: Origin,
    url_hint: &str,
) -> DocumentStyleSheet {
    let media = MediaList::empty();
    let media = ServoArc::new(shared_lock.wrap(media));
    let url = Url::parse(url_hint).expect("static URL must parse");
    let url_data = UrlExtraData::from(url);
    let stylesheet = Stylesheet::from_str(
        css,
        url_data,
        origin,
        media,
        shared_lock.clone(),
        None,
        None,
        quirks,
        AllowImportRules::Yes,
    );
    DocumentStyleSheet(ServoArc::new(stylesheet))
}

/// Walk the DOM and collect text content from all `<style>` elements.
fn collect_author_styles(dom: &DemoDom) -> Vec<String> {
    let mut styles = Vec::new();
    for node_id in dom.all_node_ids() {
        let node = dom.node(node_id);
        if let DemoNodeData::Element(element) = &node.data {
            if element.name.ns != markup5ever::ns!(html) {
                continue;
            }
            if !element.name.local.as_ref().eq_ignore_ascii_case("style") {
                continue;
            }
            let mut buffer = String::new();
            for child in &node.children {
                if let DemoNodeData::Text(text) = &dom.node(*child).data {
                    buffer.push_str(text);
                }
            }
            let trimmed = buffer.trim();
            if !trimmed.is_empty() {
                styles.push(trimmed.to_string());
            }
        }
    }
    if styles.is_empty() {
        styles.push(FALLBACK_AUTHOR_CSS.trim().to_string());
    }
    styles
}

fn translate_quirks_mode(mode: HtmlQuirksMode) -> style::context::QuirksMode {
    match mode {
        HtmlQuirksMode::NoQuirks => style::context::QuirksMode::NoQuirks,
        HtmlQuirksMode::LimitedQuirks => style::context::QuirksMode::LimitedQuirks,
        HtmlQuirksMode::Quirks => style::context::QuirksMode::Quirks,
    }
}

struct NoopSpeculativePainters;

impl RegisteredSpeculativePainters for NoopSpeculativePainters {
    fn get(&self, _name: &Atom) -> Option<&dyn RegisteredSpeculativePainter> {
        None
    }
}

static NOOP_PAINTERS: NoopSpeculativePainters = NoopSpeculativePainters;
