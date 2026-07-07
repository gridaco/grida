//! Deterministic lab text metric — a stand-in for real shaping.
//!
//! The *contract* under test is the measurement seam (Phase M; re-measure at
//! layout-imposed extents), not typography. The metric is intentionally
//! trivial so humans and LLMs can compute it by hand (E3 probe):
//!
//! - every character advances `0.6 × font_size`
//! - line height is `1.2 × font_size`
//! - greedy word wrap on ASCII spaces; a word never breaks internally
//!   (a word wider than the constraint overflows on its own line)
//! - trailing spaces on a wrapped line are dropped

pub const CHAR_W: f32 = 0.6;
pub const LINE_H: f32 = 1.2;

pub fn char_width(font_size: f32) -> f32 {
    CHAR_W * font_size
}

/// Returns (width, height) of `content` at `font_size`, wrapped at
/// `max_width` when given (Fixed width ⇒ wrap constraint; Auto ⇒ single line).
pub fn measure_text(content: &str, font_size: f32, max_width: Option<f32>) -> (f32, f32) {
    let cw = char_width(font_size);
    let lh = LINE_H * font_size;
    if content.is_empty() {
        return (0.0, lh);
    }
    match max_width {
        None => (content.chars().count() as f32 * cw, lh),
        Some(maxw) => {
            let max_chars = if cw > 0.0 {
                (maxw / cw).floor().max(0.0) as usize
            } else {
                usize::MAX
            };
            let mut lines: Vec<usize> = vec![]; // char count per line
            let mut current = 0usize;
            for word in content.split(' ') {
                let wlen = word.chars().count();
                if current == 0 {
                    current = wlen;
                } else if current + 1 + wlen <= max_chars {
                    current += 1 + wlen;
                } else {
                    lines.push(current);
                    current = wlen;
                }
            }
            lines.push(current);
            let widest = lines.iter().copied().max().unwrap_or(0);
            (widest as f32 * cw, lines.len() as f32 * lh)
        }
    }
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
}
