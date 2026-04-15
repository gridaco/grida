/**
 * @fileoverview Faux list rendering for Figma → Grida text conversion.
 *
 * Grida's text model has no native list/paragraph-level support (no bullet
 * types, no indentation levels, no list spacing). This module fakes the
 * visual appearance of Figma lists by prepending bullet/number characters
 * and whitespace indentation directly into the text string, then shifting
 * all downstream character-range indices accordingly.
 *
 * **This is intentionally lossy** — round-tripping back to Figma will NOT
 * restore list semantics. The module exists purely to preserve the *visual*
 * appearance of lists on import.
 *
 * ## Removal / upgrade path
 *
 * When Grida gains native list support, delete this file and remove the
 * single `applyFauxList()` call site in `lib.ts`. All faux-list logic is
 * contained here — nothing leaks into the rest of the converter.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Figma REST API line type (per-line, parallel to newline-split text). */
export type FigmaLineType = "NONE" | "ORDERED" | "UNORDERED";

/**
 * A character-range span that will be shifted when prefixes are inserted.
 * Intentionally minimal so it works with `StyledTextRun` (`{ start, end, … }`).
 */
export interface CharRange {
  start: number;
  end: number;
}

/** Input to {@link applyFauxList}. */
export interface FauxListInput {
  /** The original flat text string (newline-delimited). */
  text: string;
  /** Per-line list type from Figma. May be shorter than the line count. */
  lineTypes: readonly FigmaLineType[];
  /** Per-line indentation level (integer ≥ 0). May be shorter. */
  lineIndentations: readonly number[];
}

/** Output of {@link applyFauxList}. */
export interface FauxListResult {
  /** The rewritten text with bullet/number prefixes and indentation. */
  text: string;
  /**
   * Number of characters inserted *before* each line's original content.
   * Always has the same length as `text.split("\n")` on the *original* text.
   */
  prefixLengths: readonly number[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Indent unit prepended per indentation level (4 spaces ≈ Figma's ~24px default). */
const INDENT_UNIT = "    ";

/** Bullet character (Figma uses • at all nesting levels). */
const BULLET = "•";

/** Suffix appended after the bullet / number marker. */
const MARKER_SUFFIX = " ";

// ---------------------------------------------------------------------------
// Core — text rewriting
// ---------------------------------------------------------------------------

/**
 * Rewrites `text` to include faux bullet/number prefixes and indentation.
 *
 * This is a **pure function** — it does not mutate its inputs.
 *
 * @returns `null` if there are no list lines (fast path — no work needed),
 *          otherwise the rewritten text and per-line prefix lengths.
 */
export function applyFauxList(input: FauxListInput): FauxListResult | null {
  const { text, lineTypes, lineIndentations } = input;

  // Fast path: nothing to do.
  if (lineTypes.every((t) => t === "NONE")) {
    return null;
  }

  const lines = text.split("\n");
  const prefixLengths: number[] = [];
  const newLines: string[] = [];

  // Track ordered-list numbering per indentation level.
  const orderedCounters = new Map<number, number>();

  for (let i = 0; i < lines.length; i++) {
    const type: FigmaLineType = lineTypes[i] ?? "NONE";
    const indent: number = lineIndentations[i] ?? 0;

    let prefix = "";

    if (type === "NONE") {
      orderedCounters.clear();
    } else {
      // Indentation
      prefix += INDENT_UNIT.repeat(indent);

      if (type === "UNORDERED") {
        prefix += BULLET + MARKER_SUFFIX;
      } else if (type === "ORDERED") {
        // Reset counter when entering a new list run at this level.
        const prevType: FigmaLineType = lineTypes[i - 1] ?? "NONE";
        const prevIndent: number = lineIndentations[i - 1] ?? 0;
        if (prevType !== "ORDERED" || prevIndent !== indent) {
          orderedCounters.set(indent, 1);
          // Clear deeper levels
          for (const [key] of orderedCounters) {
            if (key > indent) orderedCounters.delete(key);
          }
        } else {
          orderedCounters.set(indent, (orderedCounters.get(indent) ?? 0) + 1);
        }
        const num = orderedCounters.get(indent) ?? 1;
        prefix += `${num}.${MARKER_SUFFIX}`;
      }
    }

    prefixLengths.push(prefix.length);
    newLines.push(prefix + lines[i]!);
  }

  return {
    text: newLines.join("\n"),
    prefixLengths,
  };
}

// ---------------------------------------------------------------------------
// Offset shifting — styled runs
// ---------------------------------------------------------------------------

/**
 * Shift an array of `{ start, end }` character ranges to account for
 * inserted prefix characters.
 *
 * Mutates `ranges` **in-place** for efficiency.
 *
 * @param ranges        Styled runs (or any `{ start, end }` spans).
 * @param origText      The *original* text (before faux-list transform).
 * @param prefixLengths Per-line prefix lengths from {@link applyFauxList}.
 */
export function shiftRanges(
  ranges: CharRange[],
  origText: string,
  prefixLengths: readonly number[]
): void {
  if (ranges.length === 0) return;

  const mapFn = buildOffsetMapper(origText, prefixLengths);
  for (const r of ranges) {
    r.start = mapFn(r.start);
    r.end = mapFn(r.end);
  }
}

// ---------------------------------------------------------------------------
// Offset shifting — characterStyleOverrides
// ---------------------------------------------------------------------------

/**
 * Rebuild `characterStyleOverrides` with base-style (`0`) entries inserted
 * for faux-list prefix characters.
 *
 * This is a **pure function** — it does not mutate its inputs.
 *
 * @param origOverrides The original `characterStyleOverrides` array.
 * @param origText      The *original* text (before faux-list transform).
 * @param prefixLengths Per-line prefix lengths from {@link applyFauxList}.
 * @returns A new array suitable for the rewritten text.
 */
export function shiftCharOverrides(
  origOverrides: readonly number[],
  origText: string,
  prefixLengths: readonly number[]
): number[] {
  const lines = origText.split("\n");
  const result: number[] = [];
  let origIdx = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const pLen = prefixLengths[lineIdx] ?? 0;

    // Insert base-style (0) for prefix characters.
    for (let p = 0; p < pLen; p++) {
      result.push(0);
    }

    // Copy original overrides for this line's characters.
    const lineLen = lines[lineIdx]!.length;
    for (let c = 0; c < lineLen; c++) {
      result.push(origOverrides[origIdx] ?? 0);
      origIdx++;
    }

    // The newline character (present between lines, not after the last).
    if (lineIdx < lines.length - 1) {
      result.push(origOverrides[origIdx] ?? 0);
      origIdx++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a function that maps an original character offset to its new offset
 * after prefix insertion.
 */
function buildOffsetMapper(
  origText: string,
  prefixLengths: readonly number[]
): (origOffset: number) => number {
  // Precompute where each original line starts.
  const lines = origText.split("\n");
  const lineStarts: number[] = [];
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStarts.push(pos);
    pos += lines[i]!.length + 1; // +1 for \n
  }

  // Cumulative extra characters inserted up to and including line i.
  const cumPrefix: number[] = [];
  let cum = 0;
  for (let i = 0; i < lines.length; i++) {
    cum += prefixLengths[i] ?? 0;
    cumPrefix.push(cum);
  }

  return (origOffset: number): number => {
    // Binary search for the line containing origOffset.
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= origOffset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return origOffset + cumPrefix[lo]!;
  };
}
