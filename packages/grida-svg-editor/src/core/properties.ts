// Property resolution per the README's "Observation — properties" section.
//
// Two stages are exposed:
//
//   declared  — the literal source string (with CSS-wide keywords resolved
//               but var() / url() preserved verbatim). For SVG, the value
//               comes from either an inline style declaration, a
//               presentation attribute, an inherited parent value, or the
//               property's initial value.
//
//   computed  — the type-parsed value, ready for the inspector. For unknown
//               property names, `computed` mirrors `declared` as a string.
//               For known names, we type-parse (numbers for opacity, paint
//               objects for fill/stroke, etc.).
//
// Out of scope for v0 (per README): `<style>` block resolution. Declarations
// from `<style>` blocks fall through to `defaulted` / `inherited` provenance.

import type {
  InvalidComputedValue,
  NodeId,
  Provenance,
  PropertyValue,
} from "../types";
import type { SvgDocument } from "./document";

/** SVG properties that inherit per SVG 2 §6 (subset; the common ones). */
const INHERITED: ReadonlySet<string> = new Set([
  "color",
  "cursor",
  "direction",
  "fill",
  "fill-opacity",
  "fill-rule",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "marker",
  "marker-end",
  "marker-mid",
  "marker-start",
  "paint-order",
  "pointer-events",
  "shape-rendering",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "text-rendering",
  "visibility",
  "word-spacing",
  "writing-mode",
]);

/** Initial values for known properties (subset). */
const INITIAL: Record<string, string> = {
  fill: "black",
  stroke: "none",
  "fill-opacity": "1",
  "stroke-opacity": "1",
  "stroke-width": "1",
  opacity: "1",
  visibility: "visible",
  display: "inline",
};

/**
 * Resolve a property's declared value and its provenance for a single node.
 *
 * The cascade engine here covers what the README says is in scope:
 * presentation attributes + inline style + parent inheritance + initial.
 * `<style>` block matching is deferred.
 */
export function resolve_declared(
  doc: SvgDocument,
  id: NodeId,
  property: string
): { declared: string | null; provenance: Provenance } {
  // 1. inline style="..."
  const inline = doc.get_style(id, property);
  if (inline !== null && inline !== "") {
    return {
      declared: inline,
      provenance: { origin: "author", carrier: "inline_style" },
    };
  }
  // 2. presentation attribute (same name as the CSS property for SVG attrs
  //    that double as CSS properties).
  const attr = doc.get_attr(id, property);
  if (attr !== null && attr !== "") {
    return {
      declared: attr,
      provenance: { origin: "author", carrier: "presentation_attribute" },
    };
  }
  // 3. Inherited.
  if (INHERITED.has(property)) {
    const parent = doc.parent_of(id);
    if (parent !== null && doc.is_element(parent)) {
      const r = resolve_declared(doc, parent, property);
      if (r.declared !== null) {
        return {
          declared: r.declared,
          provenance: { origin: "author", carrier: "inherited" },
        };
      }
    }
  }
  // 4. Default / initial.
  const initial = INITIAL[property] ?? null;
  return {
    declared: initial,
    provenance: { origin: "user_agent", carrier: "defaulted" },
  };
}

/**
 * Type-parsed computed value for known properties. Unknown property names
 * return the declared string as-is.
 */
export function compute_known(
  property: string,
  declared: string | null
): unknown | InvalidComputedValue | null {
  if (declared === null) return null;
  const trimmed = declared.trim();
  if (
    trimmed === "inherit" ||
    trimmed === "initial" ||
    trimmed === "unset" ||
    trimmed === "revert" ||
    trimmed === "revert-layer"
  ) {
    return null;
  }
  if (/^var\s*\(/i.test(trimmed)) {
    return {
      error: "invalid_at_computed_value_time",
      reason: `var() substitution requires a cascade engine (not implemented)`,
    };
  }
  // Type-parse a few known names.
  switch (property) {
    case "opacity":
    case "fill-opacity":
    case "stroke-opacity":
    case "stroke-width":
    case "x":
    case "y":
    case "width":
    case "height":
    case "cx":
    case "cy":
    case "r":
    case "rx":
    case "ry":
    case "font-size": {
      const n = parseFloat(trimmed);
      return Number.isFinite(n) ? n : trimmed;
    }
    default:
      return trimmed;
  }
}

export function read_property(
  doc: SvgDocument,
  id: NodeId,
  property: string
): PropertyValue {
  const { declared, provenance } = resolve_declared(doc, id, property);
  const computed = compute_known(property, declared);
  return {
    declared,
    computed: computed as PropertyValue["computed"],
    provenance,
  };
}

/** Which carrier should a `set_property` write to? Per the README (P1):
 *  whichever carrier currently wins the cascade. If nothing wins (defaulted /
 *  inherited), write a presentation attribute by default. */
export function choose_write_carrier(
  doc: SvgDocument,
  id: NodeId,
  property: string
): "inline_style" | "presentation_attribute" {
  const inline = doc.get_style(id, property);
  if (inline !== null && inline !== "") return "inline_style";
  return "presentation_attribute";
}
