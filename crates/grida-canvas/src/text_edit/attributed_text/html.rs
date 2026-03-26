//! HTML serialization and deserialization for [`AttributedText`].
//!
//! **Serialize** (copy): converts a range of styled runs into inline-styled
//! HTML suitable for the system clipboard.
//!
//! **Deserialize** (paste): parses a subset of HTML (inline `<span>` with
//! `style`, plus `<b>`, `<i>`, `<u>`, `<s>`) back into styled runs.
//!
//! The HTML subset is intentionally minimal — it covers bold, italic,
//! underline, strikethrough, font size, font weight, font style, color,
//! and font family. Attributes that HTML cannot express (OpenType features,
//! variable font axes, optical sizing) are silently dropped on serialize
//! and left at defaults on deserialize.

use super::{
    AttributedText, CGColor, Paint, StyledRun, TextDecorationLine, TextStyle,
};

// ---------------------------------------------------------------------------
// Serialize (AttributedText → HTML)
// ---------------------------------------------------------------------------

/// Serialize the runs in `[lo, hi)` of an `AttributedText` to inline-styled
/// HTML. Returns the HTML string.
///
/// Each run becomes a `<span style="...">text</span>`. Attributes that match
/// the `default_style` are omitted to reduce noise.
pub fn runs_to_html(at: &AttributedText, lo: usize, hi: usize) -> String {
    let text = at.text();
    let lo = lo.min(text.len());
    let hi = hi.min(text.len());
    if lo >= hi {
        return String::new();
    }

    let default = at.default_style();
    let mut html = String::with_capacity((hi - lo) * 2);

    for run in at.runs() {
        let rs = run.start as usize;
        let re = run.end as usize;

        // Clamp to selection.
        let start = rs.max(lo);
        let end = re.min(hi);
        if start >= end {
            continue;
        }

        let slice = &text[start..end];
        let style = &run.style;

        let css = style_to_css(style, default);
        if css.is_empty() {
            // No style differences — emit raw text (HTML-escaped).
            html_escape_into(&mut html, slice);
        } else {
            html.push_str("<span style=\"");
            html.push_str(&css);
            html.push_str("\">");
            html_escape_into(&mut html, slice);
            html.push_str("</span>");
        }
    }

    html
}

fn style_to_css(style: &TextStyle, default: &TextStyle) -> String {
    let mut parts: Vec<String> = Vec::new();

    if style.font_weight != default.font_weight {
        parts.push(format!("font-weight:{}", style.font_weight));
    }
    if style.font_style_italic != default.font_style_italic {
        parts.push(if style.font_style_italic {
            "font-style:italic".into()
        } else {
            "font-style:normal".into()
        });
    }
    if (style.font_size - default.font_size).abs() > f32::EPSILON {
        parts.push(format!("font-size:{}px", style.font_size));
    }
    if style.font_family != default.font_family {
        parts.push(format!("font-family:\"{}\"", style.font_family));
    }
    if style.text_decoration_line != default.text_decoration_line {
        match style.text_decoration_line {
            TextDecorationLine::Underline => parts.push("text-decoration:underline".into()),
            TextDecorationLine::LineThrough => parts.push("text-decoration:line-through".into()),
            TextDecorationLine::Overline => parts.push("text-decoration:overline".into()),
            TextDecorationLine::None => parts.push("text-decoration:none".into()),
        }
    }
    if style.fills != default.fills {
        if let Some(c) = style.fills.iter().find_map(|p| p.solid_color()) {
            parts.push(format!(
                "color:rgba({},{},{},{})",
                c.r,
                c.g,
                c.b,
                c.a as f32 / 255.0,
            ));
        }
    }

    parts.join(";")
}

fn html_escape_into(out: &mut String, s: &str) {
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\n' => out.push_str("<br>"),
            _ => out.push(ch),
        }
    }
}

// ---------------------------------------------------------------------------
// Deserialize (HTML → AttributedText)
// ---------------------------------------------------------------------------

/// Parse inline-styled HTML into an `AttributedText` with the given
/// `base_style` as the default.
///
/// Supports:
/// - `<span style="...">` with CSS properties: `font-weight`, `font-style`,
///   `font-size`, `font-family`, `text-decoration`, `color`
/// - `<b>`, `<strong>` → bold
/// - `<i>`, `<em>` → italic
/// - `<u>` → underline
/// - `<s>`, `<strike>`, `<del>` → line-through
/// - `<br>` → newline
/// - Nested tags (style inherits from parent)
///
/// Unknown tags are ignored (their text content is still captured).
/// HTML entities `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#NNN;`, `&#xHH;` are
/// decoded.
pub fn html_to_attributed_text(
    html: &str,
    base_style: TextStyle,
) -> Result<AttributedText, super::InvariantError> {
    let mut parser = HtmlParser::new(html, base_style.clone());
    parser.parse();

    if parser.text.is_empty() {
        return Ok(AttributedText::empty(base_style));
    }

    // Build runs from the collected segments.
    let mut runs: Vec<StyledRun> = Vec::new();
    for seg in &parser.segments {
        if seg.start >= seg.end {
            continue;
        }
        if let Some(last) = runs.last_mut() {
            if last.style == seg.style && last.end == seg.start {
                last.end = seg.end;
                continue;
            }
        }
        runs.push(StyledRun {
            start: seg.start,
            end: seg.end,
            style: seg.style.clone(),
        });
    }

    if runs.is_empty() {
        runs.push(StyledRun {
            start: 0,
            end: parser.text.len() as u32,
            style: base_style.clone(),
        });
    }

    AttributedText::try_from_parts(parser.text, base_style, Default::default(), runs)
}

// ---------------------------------------------------------------------------
// Minimal HTML parser (no dependencies)
// ---------------------------------------------------------------------------

struct Segment {
    start: u32,
    end: u32,
    style: TextStyle,
}

struct HtmlParser {
    input: Vec<char>,
    pos: usize,
    text: String,
    segments: Vec<Segment>,
    style_stack: Vec<TextStyle>,
}

/// Returns `true` for HTML tags that represent block-level elements.
/// Closing a block element inserts a newline to preserve paragraph structure.
fn is_block_tag(tag: &str) -> bool {
    matches!(
        tag,
        "p" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
            | "li" | "ul" | "ol" | "blockquote" | "pre"
            | "section" | "article" | "header" | "footer"
            | "tr" | "table"
    )
}

impl HtmlParser {
    fn new(html: &str, base_style: TextStyle) -> Self {
        Self {
            input: html.chars().collect(),
            pos: 0,
            text: String::new(),
            segments: Vec::new(),
            style_stack: vec![base_style],
        }
    }

    fn current_style(&self) -> &TextStyle {
        self.style_stack.last().unwrap()
    }

    fn parse(&mut self) {
        while self.pos < self.input.len() {
            if self.input[self.pos] == '<' {
                self.parse_tag();
            } else if self.input[self.pos] == '&' {
                let ch = self.parse_entity();
                self.push_char(ch);
            } else {
                let ch = self.input[self.pos];
                self.pos += 1;
                // HTML whitespace collapsing: \n, \r, \t → space,
                // and consecutive whitespace collapses to a single space.
                if ch == '\n' || ch == '\r' || ch == '\t' {
                    // Collapse to a single space (skip if previous char was already a space).
                    if !self.text.ends_with(' ') && !self.text.ends_with('\n') && !self.text.is_empty() {
                        self.push_char(' ');
                    }
                } else {
                    self.push_char(ch);
                }
            }
        }
    }

    fn push_char(&mut self, ch: char) {
        let byte_start = self.text.len() as u32;
        self.text.push(ch);
        let byte_end = self.text.len() as u32;
        let style = self.current_style().clone();
        self.segments.push(Segment {
            start: byte_start,
            end: byte_end,
            style,
        });
    }

    fn parse_tag(&mut self) {
        debug_assert_eq!(self.input[self.pos], '<');
        self.pos += 1; // skip '<'

        // Closing tag?
        let is_closing = self.pos < self.input.len() && self.input[self.pos] == '/';
        if is_closing {
            self.pos += 1;
        }

        // Tag name
        let tag_name = self.read_ident().to_lowercase();

        // Skip comments (<!--...-->), directives (<!doctype>, <?xml?>),
        // and namespaced tags (<o:p>) — read_ident() yields an empty or
        // unparsable name for these because '!', '?', ':' are not ident chars.
        if tag_name.is_empty() {
            self.skip_to_tag_end();
            return;
        }

        // Self-closing or void tags
        if tag_name == "br" {
            self.skip_to_tag_end();
            self.push_char('\n');
            return;
        }

        if is_closing {
            self.skip_to_tag_end();
            if self.style_stack.len() > 1 {
                self.style_stack.pop();
            }
            // Block-level closing tags insert a newline (unless already at
            // line start, to avoid double newlines from adjacent blocks).
            if is_block_tag(&tag_name) && !self.text.is_empty() && !self.text.ends_with('\n') {
                self.push_char('\n');
            }
            return;
        }

        // Parse attributes (we only care about "style")
        let mut style_attr = String::new();
        loop {
            self.skip_whitespace();
            if self.pos >= self.input.len() || self.input[self.pos] == '>' || self.input[self.pos] == '/' {
                break;
            }
            let attr_name = self.read_ident().to_lowercase();
            if attr_name.is_empty() {
                // Non-ident char (e.g. '=', '!', '?', ':') — skip to end of
                // tag to avoid an infinite loop.
                self.skip_to_tag_end();
                return;
            }
            self.skip_whitespace();
            if self.pos < self.input.len() && self.input[self.pos] == '=' {
                self.pos += 1; // skip '='
                self.skip_whitespace();
                let val = self.read_attr_value();
                if attr_name == "style" {
                    style_attr = val;
                }
            }
        }

        self.skip_to_tag_end();

        // Build new style by inheriting from parent.
        let mut new_style = self.current_style().clone();

        // Apply semantic tags.
        match tag_name.as_str() {
            "b" | "strong" => new_style.font_weight = 700,
            "i" | "em" => new_style.font_style_italic = true,
            "u" => new_style.text_decoration_line = TextDecorationLine::Underline,
            "s" | "strike" | "del" => {
                new_style.text_decoration_line = TextDecorationLine::LineThrough
            }
            _ => {}
        }

        // Apply inline CSS.
        if !style_attr.is_empty() {
            apply_css_to_style(&mut new_style, &style_attr);
        }

        self.style_stack.push(new_style);
    }

    fn read_ident(&mut self) -> String {
        let mut s = String::new();
        while self.pos < self.input.len() {
            let ch = self.input[self.pos];
            if ch.is_alphanumeric() || ch == '-' || ch == '_' {
                s.push(ch);
                self.pos += 1;
            } else {
                break;
            }
        }
        s
    }

    fn read_attr_value(&mut self) -> String {
        if self.pos >= self.input.len() {
            return String::new();
        }
        let quote = self.input[self.pos];
        if quote == '"' || quote == '\'' {
            self.pos += 1;
            let mut val = String::new();
            while self.pos < self.input.len() && self.input[self.pos] != quote {
                val.push(self.input[self.pos]);
                self.pos += 1;
            }
            if self.pos < self.input.len() {
                self.pos += 1; // skip closing quote
            }
            val
        } else {
            // Unquoted value
            self.read_ident()
        }
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.input.len() && self.input[self.pos].is_whitespace() {
            self.pos += 1;
        }
    }

    fn skip_to_tag_end(&mut self) {
        while self.pos < self.input.len() && self.input[self.pos] != '>' {
            self.pos += 1;
        }
        if self.pos < self.input.len() {
            self.pos += 1; // skip '>'
        }
    }

    fn parse_entity(&mut self) -> char {
        debug_assert_eq!(self.input[self.pos], '&');
        self.pos += 1;

        let mut entity = String::new();
        while self.pos < self.input.len() && self.input[self.pos] != ';' {
            entity.push(self.input[self.pos]);
            self.pos += 1;
        }
        if self.pos < self.input.len() {
            self.pos += 1; // skip ';'
        }

        match entity.as_str() {
            "amp" => '&',
            "lt" => '<',
            "gt" => '>',
            "quot" => '"',
            "apos" => '\'',
            "nbsp" => '\u{00A0}',
            s if s.starts_with('#') => {
                let num_str = &s[1..];
                let code = if num_str.starts_with('x') || num_str.starts_with('X') {
                    u32::from_str_radix(&num_str[1..], 16).unwrap_or('?' as u32)
                } else {
                    num_str.parse::<u32>().unwrap_or('?' as u32)
                };
                char::from_u32(code).unwrap_or('?')
            }
            _ => '?', // Unknown entity
        }
    }
}

// ---------------------------------------------------------------------------
// CSS property parsing
// ---------------------------------------------------------------------------

fn apply_css_to_style(style: &mut TextStyle, css: &str) {
    for decl in css.split(';') {
        let decl = decl.trim();
        if decl.is_empty() {
            continue;
        }
        let mut parts = decl.splitn(2, ':');
        let prop = parts.next().unwrap_or("").trim().to_lowercase();
        let val = parts.next().unwrap_or("").trim();

        match prop.as_str() {
            "font-weight" => {
                if val == "bold" {
                    style.font_weight = 700;
                } else if val == "normal" {
                    style.font_weight = 400;
                } else if let Ok(w) = val.parse::<u32>() {
                    style.font_weight = w.clamp(1, 1000);
                }
            }
            "font-style" => {
                style.font_style_italic = val == "italic" || val == "oblique";
            }
            "font-size" => {
                // Accept "14px", "14pt", or bare "14"
                let num_str = val
                    .trim_end_matches("px")
                    .trim_end_matches("pt")
                    .trim_end_matches("em")
                    .trim();
                if let Ok(size) = num_str.parse::<f32>() {
                    style.font_size = size.max(1.0);
                }
            }
            "font-family" => {
                // Take the first family name, strip quotes.
                let family = val
                    .split(',')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'');
                if !family.is_empty() {
                    style.font_family = family.to_string();
                }
            }
            "text-decoration" | "text-decoration-line" => {
                if val.contains("underline") {
                    style.text_decoration_line = TextDecorationLine::Underline;
                } else if val.contains("line-through") {
                    style.text_decoration_line = TextDecorationLine::LineThrough;
                } else if val.contains("overline") {
                    style.text_decoration_line = TextDecorationLine::Overline;
                } else if val.contains("none") {
                    style.text_decoration_line = TextDecorationLine::None;
                }
            }
            "color" => {
                if let Some(color) = parse_css_color(val) {
                    style.fills = vec![Paint::from(color)];
                }
            }
            _ => {} // Ignore unknown properties.
        }
    }
}

/// Parse a subset of CSS color values: `rgb(r,g,b)`, `rgba(r,g,b,a)`, `#rrggbb`, `#rgb`.
fn parse_css_color(val: &str) -> Option<CGColor> {
    let val = val.trim();

    if val.starts_with("rgba(") && val.ends_with(')') {
        let inner = &val[5..val.len() - 1];
        let parts: Vec<&str> = inner.split(',').collect();
        if parts.len() == 4 {
            let r = parts[0].trim().parse::<f32>().ok()?.round() as u8;
            let g = parts[1].trim().parse::<f32>().ok()?.round() as u8;
            let b = parts[2].trim().parse::<f32>().ok()?.round() as u8;
            let a = (parts[3].trim().parse::<f32>().ok()? * 255.0).round() as u8;
            return Some(CGColor::from_rgba(r, g, b, a));
        }
    }

    if val.starts_with("rgb(") && val.ends_with(')') {
        let inner = &val[4..val.len() - 1];
        let parts: Vec<&str> = inner.split(',').collect();
        if parts.len() == 3 {
            let r = parts[0].trim().parse::<f32>().ok()?.round() as u8;
            let g = parts[1].trim().parse::<f32>().ok()?.round() as u8;
            let b = parts[2].trim().parse::<f32>().ok()?.round() as u8;
            return Some(CGColor::from_rgba(r, g, b, 255));
        }
    }

    if val.starts_with('#') {
        let hex = &val[1..];
        if hex.len() == 6 {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            return Some(CGColor::from_rgba(r, g, b, 255));
        } else if hex.len() == 3 {
            let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
            let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
            let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
            return Some(CGColor::from_rgba(r, g, b, 255));
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> TextStyle {
        TextStyle::default()
    }

    // -- Serialize --

    #[test]
    fn serialize_plain_text() {
        let at = AttributedText::new("Hello", base());
        let html = runs_to_html(&at, 0, 5);
        assert_eq!(html, "Hello");
    }

    #[test]
    fn serialize_bold_run() {
        let mut at = AttributedText::new("Hello World", base());
        at.apply_style(0, 5, |s| s.font_weight = 700);
        let html = runs_to_html(&at, 0, 11);
        assert!(html.contains("font-weight:700"));
        assert!(html.contains("Hello"));
        assert!(html.contains(" World"));
    }

    #[test]
    fn serialize_escapes_html() {
        let at = AttributedText::new("<b>&test</b>", base());
        let html = runs_to_html(&at, 0, at.len());
        assert!(html.contains("&lt;b&gt;"));
        assert!(html.contains("&amp;test"));
    }

    #[test]
    fn serialize_partial_range() {
        let mut at = AttributedText::new("AABBCC", base());
        at.apply_style(2, 4, |s| s.font_weight = 700);
        let html = runs_to_html(&at, 1, 5);
        // Should include partial runs: "A" normal, "BB" bold, "C" normal
        assert!(html.contains("font-weight:700"));
    }

    #[test]
    fn serialize_newlines_as_br() {
        let at = AttributedText::new("A\nB", base());
        let html = runs_to_html(&at, 0, at.len());
        assert!(html.contains("<br>"));
    }

    // -- Deserialize --

    #[test]
    fn deserialize_plain_text() {
        let at = html_to_attributed_text("Hello", base()).unwrap();
        assert_eq!(at.text(), "Hello");
        assert_eq!(at.runs().len(), 1);
    }

    #[test]
    fn deserialize_bold_tag() {
        let at = html_to_attributed_text("A<b>B</b>C", base()).unwrap();
        assert_eq!(at.text(), "ABC");
        assert_eq!(at.runs().len(), 3);
        assert_eq!(at.runs()[0].style.font_weight, 400);
        assert_eq!(at.runs()[1].style.font_weight, 700);
        assert_eq!(at.runs()[2].style.font_weight, 400);
    }

    #[test]
    fn deserialize_italic_tag() {
        let at = html_to_attributed_text("<i>italic</i>", base()).unwrap();
        assert_eq!(at.text(), "italic");
        assert!(at.runs()[0].style.font_style_italic);
    }

    #[test]
    fn deserialize_underline_tag() {
        let at = html_to_attributed_text("<u>under</u>", base()).unwrap();
        assert_eq!(at.runs()[0].style.text_decoration_line, TextDecorationLine::Underline);
    }

    #[test]
    fn deserialize_span_with_style() {
        let at = html_to_attributed_text(
            r#"<span style="font-weight:700;font-size:24px;color:#ff0000">red bold</span>"#,
            base(),
        ).unwrap();
        assert_eq!(at.text(), "red bold");
        assert_eq!(at.runs()[0].style.font_weight, 700);
        assert_eq!(at.runs()[0].style.font_size, 24.0);
        let c = at.runs()[0].style.fills.iter().find_map(|p| p.solid_color()).unwrap();
        assert_eq!(c.r, 255);
        assert_eq!(c.g, 0);
    }

    #[test]
    fn deserialize_nested_tags() {
        let at = html_to_attributed_text("<b><i>bold italic</i></b>", base()).unwrap();
        assert_eq!(at.text(), "bold italic");
        assert_eq!(at.runs()[0].style.font_weight, 700);
        assert!(at.runs()[0].style.font_style_italic);
    }

    #[test]
    fn deserialize_br_tag() {
        let at = html_to_attributed_text("A<br>B", base()).unwrap();
        assert_eq!(at.text(), "A\nB");
    }

    #[test]
    fn deserialize_entities() {
        let at = html_to_attributed_text("&lt;&amp;&gt;", base()).unwrap();
        assert_eq!(at.text(), "<&>");
    }

    #[test]
    fn round_trip() {
        let mut original = AttributedText::new("Hello World!", base());
        original.apply_style(0, 5, |s| s.font_weight = 700);
        original.apply_style(6, 11, |s| s.font_style_italic = true);

        let html = runs_to_html(&original, 0, original.len());
        let restored = html_to_attributed_text(&html, base()).unwrap();

        assert_eq!(restored.text(), "Hello World!");
        // Bold "Hello"
        assert_eq!(restored.style_at(0).font_weight, 700);
        // Normal " "
        assert_eq!(restored.style_at(5).font_weight, 400);
        // Italic "World"
        assert!(restored.style_at(6).font_style_italic);
        // Normal "!"
        assert!(!restored.style_at(11).font_style_italic);
    }
}
