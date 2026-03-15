//! SVG/XML input sanitization.
//!
//! AI-generated SVGs often contain XML-invalid constructs that cause strict
//! parsers (like `roxmltree` / `xmlparser` used by `usvg`) to reject the
//! input.  The most common issue is **bare `&`** characters inside `<style>`
//! blocks (e.g. Google Fonts `@import` URLs).
//!
//! This module provides a lightweight pre-processing pass that fixes these
//! issues without pulling in a full XML parser.

/// Sanitize an SVG string so that it is well-formed XML.
///
/// Currently handles:
/// - **Bare `&`**: any `&` that is not the start of a valid XML entity
///   reference (`&amp;`, `&lt;`, `&gt;`, `&apos;`, `&quot;`, `&#123;`,
///   `&#xAB;`) is replaced with `&amp;`.
pub fn sanitize_svg(svg: &str) -> String {
    let bytes = svg.as_bytes();
    let len = bytes.len();
    let mut out = String::with_capacity(len);
    let mut last = 0;

    for (i, &b) in bytes.iter().enumerate() {
        if b == b'&' {
            out.push_str(&svg[last..i]);
            if i + 1 < len && is_valid_xml_entity_start(&bytes[i + 1..]) {
                out.push('&');
            } else {
                out.push_str("&amp;");
            }
            last = i + 1;
        }
    }
    out.push_str(&svg[last..]);
    out
}

/// Check whether the bytes immediately after `&` form a valid XML entity
/// reference (up to and including the closing `;`).
fn is_valid_xml_entity_start(rest: &[u8]) -> bool {
    // Numeric: &#123; or &#xAB;
    if rest.first() == Some(&b'#') {
        let hex = matches!(rest.get(1), Some(b'x' | b'X'));
        let start = if hex { 2 } else { 1 };
        let mut j = start;
        while j < rest.len() {
            let c = rest[j];
            if c == b';' {
                return j > start;
            }
            let valid = if hex {
                c.is_ascii_hexdigit()
            } else {
                c.is_ascii_digit()
            };
            if !valid {
                return false;
            }
            j += 1;
        }
        return false;
    }

    // Named: &amp; &lt; &gt; &apos; &quot;
    const NAMED: [&[u8]; 5] = [b"amp;", b"lt;", b"gt;", b"apos;", b"quot;"];
    for ent in NAMED {
        if rest.len() >= ent.len() && &rest[..ent.len()] == ent {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passthrough_clean_svg() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red"/></svg>"#;
        assert_eq!(sanitize_svg(svg), svg);
    }

    #[test]
    fn preserves_valid_entities() {
        let svg = r#"<text>A &amp; B &lt; C &gt; D &apos;E&apos; &quot;F&quot;</text>"#;
        assert_eq!(sanitize_svg(svg), svg);
    }

    #[test]
    fn preserves_numeric_entities() {
        let svg = r#"<text>&#169; &#x2764;</text>"#;
        assert_eq!(sanitize_svg(svg), svg);
    }

    #[test]
    fn escapes_bare_ampersand_in_url() {
        let input = "url('https://fonts.googleapis.com/css2?family=Inter&family=Roboto')";
        let expected =
            "url('https://fonts.googleapis.com/css2?family=Inter&amp;family=Roboto')";
        assert_eq!(sanitize_svg(input), expected);
    }

    #[test]
    fn escapes_multiple_bare_ampersands() {
        let input = "a&b&c&d";
        let expected = "a&amp;b&amp;c&amp;d";
        assert_eq!(sanitize_svg(input), expected);
    }

    #[test]
    fn escapes_trailing_ampersand() {
        let input = "hello&";
        let expected = "hello&amp;";
        assert_eq!(sanitize_svg(input), expected);
    }

    #[test]
    fn mixed_valid_and_bare() {
        let input = "A &amp; B & C &lt; D";
        let expected = "A &amp; B &amp; C &lt; D";
        assert_eq!(sanitize_svg(input), expected);
    }

    #[test]
    fn ai_google_fonts_import() {
        let input = r#"<svg xmlns="http://www.w3.org/2000/svg">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Great+Vibes&display=swap');
  </style>
  <text>Hello</text>
</svg>"#;
        let result = sanitize_svg(input);
        assert!(result.contains("&amp;family=Great"));
        assert!(result.contains("&amp;display=swap"));
        // Should still be parseable (no double-escaping)
        assert!(!result.contains("&amp;amp;"));
    }

    #[test]
    fn already_escaped_not_double_escaped() {
        let input = "foo&amp;bar&amp;baz";
        assert_eq!(sanitize_svg(input), input);
    }

    #[test]
    fn incomplete_numeric_entity() {
        // &#abc is not valid (no closing ;, non-digit)
        let input = "&#abc";
        let expected = "&amp;#abc";
        assert_eq!(sanitize_svg(input), expected);
    }

    #[test]
    fn empty_string() {
        assert_eq!(sanitize_svg(""), "");
    }

    #[test]
    fn no_ampersands() {
        let svg = "<svg><rect x='0' y='0'/></svg>";
        assert_eq!(sanitize_svg(svg), svg);
    }
}
