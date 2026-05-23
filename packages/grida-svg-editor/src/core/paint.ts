// Paint parsing per SVG 2 §13.2 (`<paint>` production).
//
//   <paint> = none | <color> | <url> [none | <color>]? | context-fill | context-stroke
//
// `inherit` and `var()` are NOT paint values — they are defaulting /
// substitution mechanisms and appear only in `declared` strings.

import type {
  InvalidComputedValue,
  Paint,
  PaintFallback,
  PaintValue,
} from "../types";

export namespace paint {
  /**
   * Parse a *computed* paint string into the discriminated union. Returns
   * null for `inherit` / `var()` / empty. Returns an invalid-computed-
   * value record for syntactic errors (rare; we're permissive).
   */
  export function parse(
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
        reason:
          "var() substitution requires a cascade engine (not implemented)",
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
    const url_match = trimmed.match(
      /^url\(\s*(["']?)#([^)"']+)\1\s*\)\s*(.*)$/i
    );
    if (url_match) {
      const id = url_match[2];
      const rest = url_match[3].trim();
      let fallback: PaintFallback | undefined;
      if (rest !== "") {
        const f = parse(rest);
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
    // Otherwise treat as a color literal (we don't resolve; surface paint
    // context does).
    return { kind: "color", value: { kind: "rgb", value: trimmed } };
  }

  /** Serialize a Paint back to an SVG attribute / inline-style value. */
  export function serialize(p: Paint): string {
    switch (p.kind) {
      case "none":
        return "none";
      case "context_fill":
        return "context-fill";
      case "context_stroke":
        return "context-stroke";
      case "color":
        return p.value.kind === "current_color"
          ? "currentColor"
          : p.value.value;
      case "ref":
        if (p.fallback) {
          const f =
            p.fallback.kind === "none"
              ? "none"
              : p.fallback.value.kind === "current_color"
                ? "currentColor"
                : p.fallback.value.value;
          return `url(#${p.id}) ${f}`;
        }
        return `url(#${p.id})`;
    }
  }

  /**
   * Structural equality on the typed-cache PaintValue. Drives reference-
   * stable reads from `editor.node_paint`: if a rebuilt value tests equal
   * to the cached one, the prior reference is reused.
   */
  export function value_equals(a: PaintValue, b: PaintValue): boolean {
    if (a === b) return true;
    if (a.declared !== b.declared) return false;
    if (a.provenance.carrier !== b.provenance.carrier) return false;
    if (a.provenance.origin !== b.provenance.origin) return false;
    return computed_equals(a.computed, b.computed);
  }

  function computed_equals(
    a: PaintValue["computed"],
    b: PaintValue["computed"]
  ): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if ("error" in a || "error" in b) {
      return (
        "error" in a &&
        "error" in b &&
        a.error === b.error &&
        a.reason === b.reason
      );
    }
    if (a.kind !== b.kind) return false;
    if (a.kind === "color" && b.kind === "color") {
      if (a.value.kind !== b.value.kind) return false;
      if (a.value.kind === "rgb" && b.value.kind === "rgb")
        return a.value.value === b.value.value;
      return true;
    }
    if (a.kind === "ref" && b.kind === "ref") return a.id === b.id;
    if (a.kind === "none" && b.kind === "none") return true;
    if (a.kind === "context_fill" && b.kind === "context_fill") return true;
    if (a.kind === "context_stroke" && b.kind === "context_stroke") return true;
    return false;
  }
}
