/**
 * Grapheme / word boundary helpers.
 *
 * Wraps `Intl.Segmenter` (browser + Node 16+) so the editor reasons in
 * terms of user-perceived characters and word boundaries instead of
 * JS code units. A regex fallback handles environments without
 * `Intl.Segmenter`; the fallback is conservative (degrades to
 * single-char graphemes; word boundaries via `\W+`).
 */

type Segmenter = {
  segment(text: string): Iterable<{
    index: number;
    segment: string;
    isWordLike?: boolean;
  }>;
};

let grapheme_seg: Segmenter | null = null;
let word_seg: Segmenter | null = null;

function get_grapheme_segmenter(): Segmenter | null {
  if (grapheme_seg) return grapheme_seg;
  const Seg = (globalThis as { Intl?: { Segmenter?: unknown } }).Intl
    ?.Segmenter as
    | (new (locale?: string, opts?: { granularity: string }) => Segmenter)
    | undefined;
  if (!Seg) return null;
  grapheme_seg = new Seg(undefined, { granularity: "grapheme" });
  return grapheme_seg;
}

function get_word_segmenter(): Segmenter | null {
  if (word_seg) return word_seg;
  const Seg = (globalThis as { Intl?: { Segmenter?: unknown } }).Intl
    ?.Segmenter as
    | (new (locale?: string, opts?: { granularity: string }) => Segmenter)
    | undefined;
  if (!Seg) return null;
  word_seg = new Seg(undefined, { granularity: "word" });
  return word_seg;
}

/**
 * Index of the next grapheme boundary at or after `index`. Returns
 * `text.length` if `index` is already at/past the end.
 */
export function next_grapheme(text: string, index: number): number {
  if (index >= text.length) return text.length;
  const seg = get_grapheme_segmenter();
  if (!seg) return Math.min(text.length, index + 1);
  for (const s of seg.segment(text)) {
    if (s.index > index) return s.index;
  }
  return text.length;
}

/**
 * Index of the previous grapheme boundary strictly before `index`.
 * Returns `0` if `index` is `0`.
 */
export function prev_grapheme(text: string, index: number): number {
  if (index <= 0) return 0;
  const seg = get_grapheme_segmenter();
  if (!seg) return Math.max(0, index - 1);
  let prev = 0;
  for (const s of seg.segment(text)) {
    if (s.index >= index) return prev;
    prev = s.index;
  }
  return prev;
}

/**
 * Index of the next word boundary strictly after `index`. Skips
 * non-word segments so repeated calls move one word at a time.
 */
export function next_word(text: string, index: number): number {
  if (index >= text.length) return text.length;
  const seg = get_word_segmenter();
  if (!seg) {
    // Fallback: skip non-word, then word.
    let i = index;
    while (i < text.length && !is_word_char(text[i])) i++;
    while (i < text.length && is_word_char(text[i])) i++;
    return i;
  }
  let passed_word = false;
  for (const s of seg.segment(text)) {
    const end = s.index + s.segment.length;
    if (end <= index) continue;
    if (s.isWordLike) {
      passed_word = true;
      if (end > index) return end;
    } else if (passed_word) {
      return s.index;
    }
  }
  return text.length;
}

/**
 * Index of the previous word boundary strictly before `index`.
 */
export function prev_word(text: string, index: number): number {
  if (index <= 0) return 0;
  const seg = get_word_segmenter();
  if (!seg) {
    let i = index;
    while (i > 0 && !is_word_char(text[i - 1])) i--;
    while (i > 0 && is_word_char(text[i - 1])) i--;
    return i;
  }
  let target = 0;
  for (const s of seg.segment(text)) {
    if (s.index >= index) break;
    if (s.isWordLike) target = s.index;
  }
  return target;
}

/**
 * Range of the segment (word OR whitespace OR punctuation cluster)
 * containing `index`. Falls back to a zero-length range if `index` is
 * out of bounds. Used by word-granularity delete/backspace so the
 * operation matches the canonical UAX-29 segment-based behavior of
 * `crates/grida/src/text_edit/` and the shared-fixture suite:
 * a word-delete at "hello |world" (caret = 6, right after the space)
 * removes only the space, yielding "helloworld", not "world".
 */
export function segment_at(
  text: string,
  index: number
): {
  start: number;
  end: number;
} {
  if (index < 0 || index >= text.length) {
    return { start: index, end: index };
  }
  const seg = get_word_segmenter();
  if (!seg) {
    // Fallback: detect a contiguous run of word-chars vs non-word-chars.
    const isWord = is_word_char(text[index]);
    let start = index;
    let end = index + 1;
    while (start > 0 && is_word_char(text[start - 1]) === isWord) start--;
    while (end < text.length && is_word_char(text[end]) === isWord) end++;
    return { start, end };
  }
  for (const s of seg.segment(text)) {
    const end = s.index + s.segment.length;
    if (s.index <= index && index < end) return { start: s.index, end };
  }
  return { start: index, end: index };
}

/**
 * Range of the word containing `index`, or a zero-length range at
 * `index` if no word is there. Used by double-click selection.
 */
export function word_at(
  text: string,
  index: number
): {
  start: number;
  end: number;
} {
  const seg = get_word_segmenter();
  if (!seg) {
    let start = index;
    let end = index;
    while (start > 0 && is_word_char(text[start - 1])) start--;
    while (end < text.length && is_word_char(text[end])) end++;
    return { start, end };
  }
  for (const s of seg.segment(text)) {
    const end = s.index + s.segment.length;
    // `<= end` so a caret sitting at the right edge of a word
    // ("hello|") still picks that word — matches double-click UX.
    if (s.isWordLike && s.index <= index && index <= end) {
      return { start: s.index, end };
    }
    if (s.index > index) break;
  }
  return { start: index, end: index };
}

function is_word_char(ch: string): boolean {
  return /\w/.test(ch);
}
