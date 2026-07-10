//! Deterministic lab text metric — a stand-in for real shaping.
//!
//! The *contract* under test is the measurement seam (Phase M; re-measure at
//! layout-imposed extents), not typography. The metric is intentionally
//! trivial so humans and LLMs can compute it by hand (E3 probe):
//!
//! - every non-newline character advances `0.6 × font_size`
//! - line height is `1.2 × font_size`
//! - explicit `\n` line breaks are preserved
//! - greedy word wrap on ASCII spaces within each explicit line; a word never
//!   breaks internally
//!   (a word wider than the constraint overflows on its own line)
//! - trailing spaces on a wrapped line are dropped

pub const CHAR_W: f32 = 0.6;
pub const LINE_H: f32 = 1.2;

pub fn char_width(font_size: f32) -> f32 {
    CHAR_W * font_size
}

/// Floor a logical width to whole character advances, tolerating one ULP of
/// division error. A width produced by this same model as `n * char_width`
/// must admit those `n` characters when passed back as a constraint. Nudging
/// the non-negative quotient by exactly one representable step repairs that
/// closed round-trip without admitting a genuinely smaller quotient.
fn max_chars_for_width(max_width: f32, cw: f32) -> usize {
    if cw <= 0.0 {
        return usize::MAX;
    }
    let quotient = (max_width / cw).max(0.0);
    let tolerant = if quotient.is_finite() {
        f32::from_bits(quotient.to_bits() + 1)
    } else {
        quotient
    };
    tolerant.floor() as usize
}

/// Lay out text into visual lines using the lab's deterministic metric.
///
/// Explicit line breaks always create a new entry, including a final empty
/// entry for trailing `\n`. Under a width constraint, ASCII-space runs stay
/// authored while the following word fits. When that word soft-wraps, only
/// the pending separator run is dropped so it cannot become trailing ink on
/// the previous line. Words are never split internally.
pub fn layout_text_lines(content: &str, font_size: f32, max_width: Option<f32>) -> Vec<String> {
    let Some(max_width) = max_width else {
        return content.split('\n').map(str::to_owned).collect();
    };
    let cw = char_width(font_size);
    let max_chars = max_chars_for_width(max_width, cw);

    let mut lines = Vec::new();
    for explicit_line in content.split('\n') {
        let mut chars = explicit_line.chars().peekable();
        let mut current = String::new();
        let mut current_len = 0usize;
        let mut pending_spaces = String::new();
        let mut pending_len = 0usize;

        while chars.peek().is_some() {
            while chars.peek().is_some_and(|ch| *ch == ' ') {
                pending_spaces.push(chars.next().expect("peeked space"));
                pending_len += 1;
            }
            if chars.peek().is_none() {
                break;
            }

            let mut word = String::new();
            let mut word_len = 0usize;
            while chars.peek().is_some_and(|ch| *ch != ' ') {
                word.push(chars.next().expect("peeked word character"));
                word_len += 1;
            }

            let candidate_len = current_len + pending_len + word_len;
            if current_len > 0 && candidate_len > max_chars {
                lines.push(std::mem::take(&mut current));
                current = word;
                current_len = word_len;
            } else {
                current.push_str(&pending_spaces);
                current.push_str(&word);
                current_len = candidate_len;
            }
            pending_spaces.clear();
            pending_len = 0;
        }

        // No soft wrap was requested after these spaces, so they remain
        // authored content (including lines made entirely of spaces).
        current.push_str(&pending_spaces);
        lines.push(current);
    }
    lines
}

/// Returns (width, height) of `content` at `font_size`, wrapped at
/// `max_width` when given (Fixed width ⇒ soft-wrap constraint; Auto ⇒ only
/// authored line breaks).
pub fn measure_text(content: &str, font_size: f32, max_width: Option<f32>) -> (f32, f32) {
    let cw = char_width(font_size);
    let lh = LINE_H * font_size;
    let lines = layout_text_lines(content, font_size, max_width);
    let widest = lines
        .iter()
        .map(|line| line.chars().count())
        .max()
        .unwrap_or(0);
    (widest as f32 * cw, lines.len() as f32 * lh)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_line_auto() {
        // "hello" @16 → 5 × 9.6 = 48 wide, 19.2 tall
        let (w, h) = measure_text("hello", 16.0, None);
        assert_eq!(w, 48.0);
        assert!((h - 19.2).abs() < 1e-4);
    }

    #[test]
    fn wraps_greedy() {
        // "aa bb cc" @10 (cw=6): max_width 30 → 5 chars/line → "aa bb" is 5 chars…
        // per rule: "aa"(2) + 1 + "bb"(2) = 5 ≤ 5 → one line; "cc" wraps.
        let (w, h) = measure_text("aa bb cc", 10.0, Some(30.0));
        assert_eq!(w, 30.0); // "aa bb" = 5 chars × 6
        assert_eq!(h, 24.0); // 2 lines × 12
    }

    #[test]
    fn preserves_explicit_and_trailing_line_breaks() {
        let (w, h) = measure_text("a\nbb\n", 10.0, None);
        assert_eq!(w, 12.0);
        assert_eq!(h, 36.0);
    }

    #[test]
    fn wraps_each_explicit_line_independently() {
        // First explicit line wraps in two, then `x`, then the trailing empty
        // line: four measured lines total.
        let (w, h) = measure_text("aa bb cc\nx\n", 10.0, Some(30.0));
        assert_eq!(w, 30.0);
        assert_eq!(h, 48.0);
    }

    #[test]
    fn constrained_layout_preserves_leading_and_repeated_spaces() {
        assert_eq!(
            layout_text_lines("  a", 10.0, Some(60.0)),
            vec!["  a"],
            "leading spaces retain their advances"
        );
        assert_eq!(
            layout_text_lines("a  b", 10.0, Some(24.0)),
            vec!["a  b"],
            "repeated spaces remain when the following word fits"
        );
        assert_eq!(measure_text("  a", 10.0, Some(60.0)), (18.0, 12.0));
        assert_eq!(measure_text("a  b", 10.0, Some(24.0)), (24.0, 12.0));
    }

    #[test]
    fn soft_wrap_drops_only_the_separator_that_would_trail_the_line() {
        assert_eq!(
            layout_text_lines("aa  bb", 10.0, Some(24.0)),
            vec!["aa", "bb"]
        );
        assert_eq!(measure_text("aa  bb", 10.0, Some(24.0)), (12.0, 24.0));

        assert_eq!(
            layout_text_lines("a  ", 10.0, Some(60.0)),
            vec!["a  "],
            "authored trailing spaces survive when no soft wrap occurs"
        );
        assert_eq!(measure_text("a  ", 10.0, Some(60.0)), (18.0, 12.0));
    }

    #[test]
    fn model_produced_natural_width_does_not_invent_a_soft_wrap() {
        // 15 × 0.6 is representable as 9, but 9 / 0.6 rounds one ULP below
        // 15. The space makes that lost character observable as a false wrap.
        let content = "aaaaaaa aaaaaaa";
        let font_size = 1.0;
        let (natural_width, _) = measure_text(content, font_size, None);
        assert!(natural_width / char_width(font_size) < 15.0);
        assert_eq!(
            layout_text_lines(content, font_size, Some(natural_width)),
            vec![content],
            "feeding a model-produced natural width back is closed"
        );

        let genuinely_smaller = f32::from_bits(natural_width.to_bits() - 1);
        assert_eq!(
            layout_text_lines(content, font_size, Some(genuinely_smaller)),
            vec!["aaaaaaa", "aaaaaaa"],
            "the immediately smaller authored width still floors"
        );
    }
}
