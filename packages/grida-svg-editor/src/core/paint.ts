// Paint parsing per SVG 2 §13.2 (`<paint>` production).
//
//   <paint> = none | <color> | <url> [none | <color>]? | context-fill | context-stroke
//
// `inherit` and `var()` are NOT paint values — they are defaulting /
// substitution mechanisms and appear only in `declared` strings.

import type { InvalidComputedValue, Paint, PaintFallback } from "../types";

/**
 * Parse a *computed* paint string into the discriminated union. Returns null
 * for `inherit` / `var()` / empty. Returns an invalid-computed-value record
 * for syntactic errors (rare; we're permissive).
 */
export function parse_paint(
  declared: string | null
): Paint | InvalidComputedValue | null {
  if (declared === null || declared === "") return null;
  const trimmed = declared.trim();
  if (trimmed === "") return null;
  // CSS-wide keywords appear in `declared` but should have been resolved
  // upstream. If we see them here, the property is effectively absent at
  // computed time.
  if (
    trimmed === "inherit" ||
    trimmed === "initial" ||
    trimmed === "unset" ||
    trimmed === "revert" ||
    trimmed === "revert-layer"
  ) {
    return null;
  }
  // var() — cannot resolve without a cascade engine; report as invalid.
  if (/^var\s*\(/i.test(trimmed)) {
    return {
      error: "invalid_at_computed_value_time",
      reason: "var() substitution requires a cascade engine (not implemented)",
    };
  }
  if (trimmed === "none") return { kind: "none" };
  if (trimmed === "context-fill" || trimmed === "contextFill") {
    return { kind: "context_fill" };
  }
  if (trimmed === "context-stroke" || trimmed === "contextStroke") {
    return { kind: "context_stroke" };
  }
  // url(#id) [fallback]?
  const url_match = trimmed.match(/^url\(\s*(["']?)#([^)"']+)\1\s*\)\s*(.*)$/i);
  if (url_match) {
    const id = url_match[2];
    const rest = url_match[3].trim();
    let fallback: PaintFallback | undefined;
    if (rest !== "") {
      const f = parse_paint(rest);
      if (f && (f as Paint).kind === "none") {
        fallback = { kind: "none" };
      } else if (f && (f as Paint).kind === "color") {
        fallback = {
          kind: "color",
          value: (f as Paint & { kind: "color" }).value,
        };
      }
    }
    return fallback ? { kind: "ref", id, fallback } : { kind: "ref", id };
  }
  // currentColor
  if (/^currentcolor$/i.test(trimmed)) {
    return { kind: "color", value: { kind: "current_color" } };
  }
  // Otherwise treat as a color literal (we don't resolve; surface paint context does).
  return { kind: "color", value: { kind: "rgb", value: trimmed } };
}

/** Serialize a Paint back to an SVG attribute / inline-style value. */
export function serialize_paint(paint: Paint): string {
  switch (paint.kind) {
    case "none":
      return "none";
    case "context_fill":
      return "context-fill";
    case "context_stroke":
      return "context-stroke";
    case "color":
      return paint.value.kind === "current_color"
        ? "currentColor"
        : paint.value.value;
    case "ref":
      if (paint.fallback) {
        const f =
          paint.fallback.kind === "none"
            ? "none"
            : paint.fallback.value.kind === "current_color"
              ? "currentColor"
              : paint.fallback.value.value;
        return `url(#${paint.id}) ${f}`;
      }
      return `url(#${paint.id})`;
  }
}
