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

use crate::model::{TextPayloadRef, TextStyleRec};

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

/// One contiguous styled fragment on a materialized visual line.
///
/// `run_index` is `None` for the historical uniform text payload and otherwise
/// identifies the source attributed run. Paint is intentionally not copied
/// into the measurement tier; the drawlist resolves that index against the
/// node-level fallback paints after line topology is fixed.
#[derive(Debug, Clone, PartialEq)]
pub struct TextFragmentLayout {
    pub text: String,
    pub x: f32,
    pub advance: f32,
    pub style: TextStyleRec,
    pub run_index: Option<usize>,
}

/// One visual line shared by measurement and draw-list materialization.
/// Different run sizes share a baseline; the largest run owns the line height.
#[derive(Debug, Clone, PartialEq)]
pub struct TextLineLayout {
    pub text: String,
    pub fragments: Vec<TextFragmentLayout>,
    pub width: f32,
    pub height: f32,
    pub baseline_y: f32,
}

#[derive(Debug, Clone, Copy)]
struct StyledChar {
    ch: char,
    style: TextStyleRec,
    run_index: usize,
}

fn attributed_chars(text: TextPayloadRef<'_>) -> Vec<StyledChar> {
    let Some(runs) = text.runs else {
        return Vec::new();
    };
    let mut run_index = 0usize;
    text.text
        .char_indices()
        .map(|(byte, ch)| {
            while run_index + 1 < runs.len() && byte >= runs[run_index].end as usize {
                run_index += 1;
            }
            let run = runs.get(run_index);
            StyledChar {
                ch,
                style: run.map_or(text.default_style, |run| run.style),
                run_index,
            }
        })
        .collect()
}

fn chars_width(chars: &[StyledChar]) -> f32 {
    chars
        .iter()
        .map(|character| char_width(character.style.font_size))
        .sum()
}

fn width_fits(candidate: f32, max_width: f32) -> bool {
    if candidate <= max_width {
        return true;
    }
    if !max_width.is_finite() || max_width < 0.0 {
        return false;
    }
    candidate <= f32::from_bits(max_width.to_bits() + 1)
}

/// Greedy ASCII-space wrapping for one explicit line. A word is indivisible;
/// separator spaces are retained while its following word fits and discarded
/// only when that word starts a new visual line.
fn wrap_styled_line(chars: &[StyledChar], max_width: Option<f32>) -> Vec<Vec<StyledChar>> {
    let Some(max_width) = max_width else {
        return vec![chars.to_vec()];
    };
    let mut lines = Vec::new();
    let mut current = Vec::new();
    let mut current_width = 0.0;
    let mut cursor = 0usize;

    while cursor < chars.len() {
        let spaces_start = cursor;
        while cursor < chars.len() && chars[cursor].ch == ' ' {
            cursor += 1;
        }
        let pending_spaces = &chars[spaces_start..cursor];
        if cursor == chars.len() {
            current.extend_from_slice(pending_spaces);
            break;
        }

        let word_start = cursor;
        while cursor < chars.len() && chars[cursor].ch != ' ' {
            cursor += 1;
        }
        let word = &chars[word_start..cursor];
        let candidate_width = current_width + chars_width(pending_spaces) + chars_width(word);
        if !current.is_empty() && !width_fits(candidate_width, max_width) {
            lines.push(std::mem::take(&mut current));
            current.extend_from_slice(word);
            current_width = chars_width(word);
        } else {
            current.extend_from_slice(pending_spaces);
            current.extend_from_slice(word);
            current_width = candidate_width;
        }
    }

    lines.push(current);
    lines
}

fn materialize_styled_line(
    chars: Vec<StyledChar>,
    default_style: TextStyleRec,
    top: f32,
) -> TextLineLayout {
    let font_size = chars
        .iter()
        .map(|character| character.style.font_size)
        .reduce(f32::max)
        .unwrap_or(default_style.font_size);
    let height = font_size * LINE_H;
    let baseline_y = top + font_size * 0.85;
    let mut fragments: Vec<TextFragmentLayout> = Vec::new();
    let mut line_text = String::new();
    let mut x = 0.0;

    for character in chars {
        line_text.push(character.ch);
        let advance = char_width(character.style.font_size);
        if let Some(fragment) = fragments.last_mut().filter(|fragment| {
            fragment.run_index == Some(character.run_index) && fragment.style == character.style
        }) {
            fragment.text.push(character.ch);
            fragment.advance += advance;
        } else {
            fragments.push(TextFragmentLayout {
                text: character.ch.to_string(),
                x,
                advance,
                style: character.style,
                run_index: Some(character.run_index),
            });
        }
        x += advance;
    }

    TextLineLayout {
        text: line_text,
        fragments,
        width: x,
        height,
        baseline_y,
    }
}

/// Materialize visual lines for either uniform or attributed text.
///
/// The deterministic metric deliberately makes weight and italic style
/// advance-neutral. Font size alone controls character advance and line
/// height, which keeps the model's layout hand-computable while preserving
/// style in each fragment for the paint tier.
pub fn layout_text_payload(
    text: TextPayloadRef<'_>,
    max_width: Option<f32>,
) -> Vec<TextLineLayout> {
    if text.runs.is_none() {
        let font_size = text.default_style.font_size;
        let mut top = 0.0;
        return layout_text_lines(text.text, font_size, max_width)
            .into_iter()
            .map(|line| {
                let advance = line.chars().count() as f32 * char_width(font_size);
                let height = font_size * LINE_H;
                let baseline_y = top + font_size * 0.85;
                top += height;
                let fragments = if line.is_empty() {
                    Vec::new()
                } else {
                    vec![TextFragmentLayout {
                        text: line.clone(),
                        x: 0.0,
                        advance,
                        style: text.default_style,
                        run_index: None,
                    }]
                };
                TextLineLayout {
                    text: line,
                    fragments,
                    width: advance,
                    height,
                    baseline_y,
                }
            })
            .collect();
    }

    let mut explicit_lines: Vec<Vec<StyledChar>> = vec![Vec::new()];
    for character in attributed_chars(text) {
        if character.ch == '\n' {
            explicit_lines.push(Vec::new());
        } else {
            explicit_lines
                .last_mut()
                .expect("seeded explicit line")
                .push(character);
        }
    }

    let mut top = 0.0;
    let mut lines = Vec::new();
    for explicit_line in explicit_lines {
        for visual_line in wrap_styled_line(&explicit_line, max_width) {
            let line = materialize_styled_line(visual_line, text.default_style, top);
            top += line.height;
            lines.push(line);
        }
    }
    lines
}

/// Measure either uniform or attributed text using the exact visual-line
/// topology later copied into the drawlist.
pub fn measure_text_payload(text: TextPayloadRef<'_>, max_width: Option<f32>) -> (f32, f32) {
    if text.runs.is_none() {
        return measure_text(text.text, text.default_style.font_size, max_width);
    }
    let lines = layout_text_payload(text, max_width);
    let width = lines.iter().map(|line| line.width).fold(0.0, f32::max);
    let height = lines.iter().map(|line| line.height).sum();
    (width, height)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{AttributedString, StyledTextRun};

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

    #[test]
    fn attributed_runs_use_size_for_metrics_and_preserve_style_boundaries() {
        let small = TextStyleRec {
            font_size: 10.0,
            font_weight: 400,
            font_style_italic: false,
        };
        let large = TextStyleRec {
            font_size: 20.0,
            font_weight: 700,
            font_style_italic: true,
        };
        let attributed = AttributedString::from_runs(
            "AA bb",
            vec![
                StyledTextRun {
                    start: 0,
                    end: 3,
                    style: small,
                    fills: None,
                },
                StyledTextRun {
                    start: 3,
                    end: 5,
                    style: large,
                    fills: None,
                },
            ],
        )
        .unwrap();
        let text = TextPayloadRef {
            text: &attributed.text,
            default_style: small,
            runs: Some(&attributed.runs),
        };

        let lines = layout_text_payload(text, Some(30.0));
        assert_eq!(
            lines
                .iter()
                .map(|line| line.text.as_str())
                .collect::<Vec<_>>(),
            ["AA", "bb"]
        );
        assert_eq!(lines[0].fragments[0].run_index, Some(0));
        assert_eq!(lines[1].fragments[0].run_index, Some(1));
        assert_eq!(lines[0].height, 12.0);
        assert_eq!(lines[1].height, 24.0);
        assert_eq!(measure_text_payload(text, Some(30.0)), (24.0, 36.0));
    }

    #[test]
    fn attributed_weight_and_italic_are_metric_neutral() {
        let plain = TextStyleRec::from_font_size(12.0);
        let styled = TextStyleRec {
            font_size: 12.0,
            font_weight: 900,
            font_style_italic: true,
        };
        let attributed = AttributedString::from_runs(
            "ab",
            vec![
                StyledTextRun {
                    start: 0,
                    end: 1,
                    style: plain,
                    fills: None,
                },
                StyledTextRun {
                    start: 1,
                    end: 2,
                    style: styled,
                    fills: None,
                },
            ],
        )
        .unwrap();
        let text = TextPayloadRef {
            text: &attributed.text,
            default_style: plain,
            runs: Some(&attributed.runs),
        };
        let line = &layout_text_payload(text, None)[0];
        assert_eq!(line.fragments.len(), 2);
        assert_eq!(line.fragments[0].advance, line.fragments[1].advance);
        assert_eq!(line.width, 2.0 * char_width(12.0));
    }
}
