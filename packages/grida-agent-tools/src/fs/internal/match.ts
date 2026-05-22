/**
 * Internal match-and-replace primitives used by `AgentFs.edit()`.
 *
 * Not part of the public package surface — consumers should call
 * `AgentFs.edit()` (or the `edit_file` AI-SDK tool) rather than depend
 * on these directly. They live under `internal/` so the `exports` map
 * doesn't surface them and a future refactor can change their shape
 * without a contract bump.
 */

/**
 * Find every occurrence of `needle` in `hay`. Used by `AgentFs.edit()`
 * to locate the snippet the model passed as `old_string` and splice in
 * `new_string`. Content-agnostic.
 *
 * Strategy (first hit wins):
 *
 *  1. **Literal substring match.** Wins almost always — the agent copies
 *     `old_string` from `read()` output, which is byte-stable.
 *  2. **Whitespace-normalized fallback.** Runs of whitespace on both sides
 *     collapse to a single space (`/\s+/g → " "`); the resulting indices
 *     are mapped back to the original document. Forgives doubled spaces
 *     between attributes and minor newline drift; **does not** enable
 *     attribute-order rewriting or semantic matching.
 *
 * That conservatism is deliberate: stricter than aider, looser than
 * Claude Code's `Edit` (which is literal-only). A single semantically-
 * fuzzy match in SVG can silently change a selector or `xlink:href` and
 * break the document.
 *
 * Returns half-open ranges `[start, end)` against `hay`. Empty for empty
 * `needle`.
 */
export function findMatches(
  hay: string,
  needle: string
): Array<[number, number]> {
  if (needle.length === 0) return [];

  const literal: Array<[number, number]> = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    literal.push([i, i + needle.length]);
    i = hay.indexOf(needle, i + needle.length);
  }
  if (literal.length > 0) return literal;

  const compactNeedle = needle.replace(/\s+/g, " ").trim();
  if (compactNeedle.length === 0) return [];

  const { compact: compactHay, map } = collapseWhitespace(hay);

  const ranges: Array<[number, number]> = [];
  let j = compactHay.indexOf(compactNeedle);
  while (j !== -1) {
    const start = map[j];
    const lastChar = j + compactNeedle.length - 1;
    const end = map[lastChar] + 1;
    ranges.push([start, end]);
    j = compactHay.indexOf(compactNeedle, j + compactNeedle.length);
  }
  return ranges;
}

/**
 * Collapse runs of whitespace in `s` to a single ASCII space, while
 * recording the original-string index of each surviving character. The
 * returned `map[i]` is the index in `s` corresponding to `compact[i]`.
 */
export function collapseWhitespace(s: string): {
  compact: string;
  map: number[];
} {
  let compact = "";
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (prevSpace) continue;
      compact += " ";
      map.push(i);
      prevSpace = true;
    } else {
      compact += ch;
      map.push(i);
      prevSpace = false;
    }
  }
  return { compact, map };
}

/**
 * Apply replacements at the given ranges. Splices right-to-left so
 * earlier indices stay valid. Ranges must be disjoint and in ascending
 * order (which is what `findMatches` returns).
 */
export function applyReplacements(
  source: string,
  ranges: ReadonlyArray<readonly [number, number]>,
  replacement: string
): string {
  let next = source;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const [start, end] = ranges[i];
    next = next.slice(0, start) + replacement + next.slice(end);
  }
  return next;
}
