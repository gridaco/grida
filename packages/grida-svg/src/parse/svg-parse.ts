// SVG string-parsing primitives.
//
// Every regex / split / lexical parse that reads SVG content lives here.
// Other modules call into this namespace; they MUST NOT roll their own
// parsing.
//
// Rules:
//   - Inputs are raw SVG attribute strings (or `null`).
//   - Outputs are typed values or `null` on parse failure.
//   - Functions are pure and deterministic.
//   - Regexes for SVG production fragments (numbers, commands, function
//     names) are defined ONCE at module top and reused.
//   - No `SvgDocument`, no DOM types, no editor types — only primitives.
//
// Usage:
//
//   import { svg_parse } from "@grida/svg/parse";
//   const pts = svg_parse.parse_points("10,20 30,40");
//   const tx = svg_parse.parse_leading_translate(node.getAttribute("transform"));

/** SVG `<number>` production (spec-aligned subset): optional sign, integer
 *  and/or fractional digits, optional scientific exponent. Matches each
 *  number wholly; consumers anchor / chain as needed. */
const SVG_NUMBER = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?";

/** Leading `translate(tx ty)` (whitespace- or comma-separated). Captures
 *  tx, ty, and the trailing rest-of-transform string. */
const LEADING_TRANSLATE_RE = new RegExp(
  `^\\s*translate\\(\\s*(${SVG_NUMBER})(?:\\s*,\\s*|\\s+)(${SVG_NUMBER})\\s*\\)\\s*(.*)$`
);

/** First `M`/`m` move in a path-`d` string: command letter + first coord
 *  pair. (We don't decode subsequent commands here — that's the path-data
 *  layer's job; this is only for "where does this path start?".) */
const PATH_FIRST_MOVE_RE = new RegExp(
  `^\\s*[Mm]\\s*(${SVG_NUMBER})(?:\\s*,\\s*|\\s+)(${SVG_NUMBER})`
);

/** All numeric tokens in a string. Reused across `parse_points`. */
const NUMBER_GLOBAL_RE = new RegExp(SVG_NUMBER, "g");

export namespace svg_parse {
  /** A `(x, y)` coordinate pair as parsed from SVG attribute strings. */
  export type Point = { x: number; y: number };

  /** Result of {@link parse_leading_translate}. */
  export type LeadingTranslate = { tx: number; ty: number; rest: string };

  /**
   * Parse a single SVG number. Returns `fallback` (default 0) when the
   * input is null, empty, or not parseable as finite.
   *
   * Used by attribute readers (`x`, `y`, `cx`, …) where missing or
   * malformed attributes are spec'd to default to 0.
   */
  export function parse_number(s: string | null, fallback = 0): number {
    if (s === null || s === "") return fallback;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Parse an SVG `points` attribute (polyline / polygon) into an array of
   * `{x, y}` pairs.
   *
   *  - Tolerant of mixed comma + whitespace separators (per SVG spec).
   *  - Skips trailing odd numbers (incomplete pairs).
   *  - Skips pairs where either coord parses as non-finite.
   *  - Returns `[]` for empty / unparseable input (NOT null).
   */
  export function parse_points(points: string): Point[] {
    if (!points) return [];
    const tokens = points.match(NUMBER_GLOBAL_RE);
    if (!tokens) return [];
    const out: Point[] = [];
    for (let i = 0; i + 1 < tokens.length; i += 2) {
      const x = parseFloat(tokens[i]);
      const y = parseFloat(tokens[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push({ x, y });
    }
    return out;
  }

  /**
   * First move command's absolute coordinates from a path `d` string.
   *
   * Returns `null` for empty / unparseable paths. A leading `m`
   * (lowercase relative) is treated as absolute per
   * [SVG 2 §9.3.4](https://www.w3.org/TR/SVG2/paths.html#PathDataMovetoCommands):
   * the first moveto is always absolute regardless of letter case.
   */
  export function parse_path_first_move(d: string): Point | null {
    if (!d) return null;
    const m = d.match(PATH_FIRST_MOVE_RE);
    if (!m) return null;
    const x = parseFloat(m[1]);
    const y = parseFloat(m[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  /**
   * Parse a leading `translate(tx, ty)` from a transform attribute.
   *
   * Returns the parsed `tx`, `ty`, and the trailing transform string
   * (everything after the closing paren, trimmed). Returns `null` if
   * the transform doesn't begin with a `translate(...)` function.
   *
   * Used by `compose_leading_translate` to coalesce repeated drag
   * deltas into a single leading translate term, keeping the
   * transform string bounded across a long gesture.
   */
  export function parse_leading_translate(
    transform: string | null
  ): LeadingTranslate | null {
    if (!transform) return null;
    const m = transform.match(LEADING_TRANSLATE_RE);
    if (!m) return null;
    const tx = parseFloat(m[1]);
    const ty = parseFloat(m[2]);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return { tx, ty, rest: m[3].trim() };
  }

  /**
   * Compute the top-left of an array of `{x, y}` points. Returns `null`
   * for empty input. Convenience for `points`-parsed pairs; lives here
   * so callers don't reimplement the empty-array guard.
   */
  export function points_top_left(points: ReadonlyArray<Point>): Point | null {
    if (points.length === 0) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
    }
    return { x: minX, y: minY };
  }
}
