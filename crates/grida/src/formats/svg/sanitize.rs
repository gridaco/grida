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
    let mut i = 0;
    let mut last = 0;

    while i < len {
        // Detect XML comment start: <!--
        if i + 4 <= len && &bytes[i..i + 4] == b"<!--" {
            // Find the closing -->
            if let Some(offset) = find_subsequence(&bytes[i + 4..], b"-->") {
                let end = i + 4 + offset + 3; // past "-->"
                i = end;
                continue;
            }
            // Unclosed comment – treat rest of input as comment (preserve as-is).
            i = len;
            continue;
        }

        // Detect CDATA start: <![CDATA[
        if i + 9 <= len && &bytes[i..i + 9] == b"<![CDATA[" {
            // Find the closing ]]>
            if let Some(offset) = find_subsequence(&bytes[i + 9..], b"]]>") {
                let end = i + 9 + offset + 3; // past "]]>"
                i = end;
                continue;
            }
            // Unclosed CDATA – treat rest of input as CDATA (preserve as-is).
            i = len;
            continue;
        }

        if bytes[i] == b'&' {
            out.push_str(&svg[last..i]);
            if i + 1 < len && is_valid_xml_entity_start(&bytes[i + 1..]) {
                out.push('&');
            } else {
                out.push_str("&amp;");
            }
            last = i + 1;
        }

        i += 1;
    }
    out.push_str(&svg[last..]);
    out
}

/// Find the first occurrence of `needle` in `haystack`, returning the byte
/// offset of the start of the match.
fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
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
        let expected = "url('https://fonts.googleapis.com/css2?family=Inter&amp;family=Roboto')";
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

    #[test]
    fn preserves_ampersand_in_cdata() {
        let input =
            "<style><![CDATA[@import url('https://fonts.googleapis.com/css2?family=Inter&display=swap')]]></style>";
        // The & inside CDATA must NOT be escaped.
        assert_eq!(sanitize_svg(input), input);
    }

    #[test]
    fn preserves_ampersand_in_comment() {
        let input = "<!-- some & comment -->";
        assert_eq!(sanitize_svg(input), input);
    }

    #[test]
    fn cdata_with_multiple_ampersands() {
        let input = "<![CDATA[a&b&c&d]]>";
        assert_eq!(sanitize_svg(input), input);
    }

    #[test]
    fn comment_with_entities() {
        let input = "<!-- &amp; &lt; &unknown; bare & -->";
        assert_eq!(sanitize_svg(input), input);
    }

    #[test]
    fn escapes_outside_but_preserves_inside_cdata() {
        let input = "before&after<![CDATA[inside&preserved]]>end&done";
        let expected = "before&amp;after<![CDATA[inside&preserved]]>end&amp;done";
        assert_eq!(sanitize_svg(input), expected);
    }

    #[test]
    fn escapes_outside_but_preserves_inside_comment() {
        let input = "before&after<!-- inside&preserved -->end&done";
        let expected = "before&amp;after<!-- inside&preserved -->end&amp;done";
        assert_eq!(sanitize_svg(input), expected);
    }

    #[test]
    fn cdata_google_fonts_full_svg() {
        let input = r#"<svg xmlns="http://www.w3.org/2000/svg">
  <style>
    <![CDATA[@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Great+Vibes&display=swap');]]>
  </style>
  <text>A &amp; B & C</text>
</svg>"#;
        let result = sanitize_svg(input);
        // Inside CDATA: & must be preserved as-is
        assert!(result.contains("&family=Great+Vibes&display=swap"));
        // Outside CDATA: bare & must be escaped
        assert!(result.contains("A &amp; B &amp; C"));
    }

    #[test]
    fn unclosed_cdata_preserves_rest() {
        let input = "before&x<![CDATA[inside&y";
        let expected = "before&amp;x<![CDATA[inside&y";
        assert_eq!(sanitize_svg(input), expected);
    }

    #[test]
    fn unclosed_comment_preserves_rest() {
        let input = "before&x<!-- inside&y";
        let expected = "before&amp;x<!-- inside&y";
        assert_eq!(sanitize_svg(input), expected);
    }
}
