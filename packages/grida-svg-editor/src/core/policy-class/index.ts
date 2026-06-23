// Policy Class — public surface.
//
// Spec: docs/wg/feat-svg-editor/glossary/policy-class.md
//
// The namespace `policy_class` carries Tables 1, 2, 3 of the spec:
//   - `policy_class.of(tag)`            — Table 1: Element → Policy Class
//   - `policy_class.legal_solutions(cls, intent)` — Table 2 lookup
//   - `policy_class.chosen_policy(cls, intent)`   — Table 3 lookup
//   - `policy_class.accepts(cls, intent)`         — capability gate
//   - `policy_class.fork_count(cls, intent)`      — fork arity
//
// Five invariants (I1–I5) are enforced by
// `__tests__/policy-class/tables.test.ts` — see test file for the full
// statement of each.

import type { Intent, PolicyClass, Solution, SolutionSpace } from "./types";

export type { PolicyClass, Intent, Solution, SolutionSpace } from "./types";

export {
  ACTIVE_POLICY_CLASSES,
  ALL_POLICY_CLASSES,
  TOP_LEVEL_INTENTS,
  VECTOR_EDIT_SUB_INTENTS,
  ALL_INTENTS,
} from "./types";

export namespace policy_class {
  // ─── Table 1 — Element → Policy Class ────────────────────────────────
  //
  // Adding a tag: extend the switch and the doc's Table 1 in the same
  // change; `__tests__/policy-class/classify.test.ts` enforces the
  // cross-consistency.

  /**
   * Map an SVG element tag name (as returned by `SvgDocument.tag_of`)
   * to its Policy Class.
   *
   * Unknown tags fall through to `"none"` — they are not editable as
   * geometry by the v1 policy surface. This includes container
   * elements (`<defs>`, `<svg>`, `<symbol>`, `<marker>`, `<clipPath>`,
   * `<mask>`, `<pattern>`, `<linearGradient>`, `<radialGradient>`,
   * `<filter>`, …) and any tag the editor has not been taught about.
   * `"none"` is a sentinel, not a fallback for buggy data.
   *
   * @param tag — lowercased element name without namespace prefix
   */
  export function of(tag: string): PolicyClass {
    switch (tag) {
      // VertexChain — single-line / open-chain / closed-chain elements
      // whose geometry is a finite ordered list of points and whose
      // resize and rotate are vertex-transport in local space.
      case "line":
      case "polyline":
      case "polygon":
        return "vertex-chain";

      // VertexBox — axis-aligned bounding-box elements whose interior
      // is either an opaque payload (image), a reference (use), or a
      // rectangular shape (rect). Corners are NOT addressable as
      // interior vertices in v1; vertex editing is rejected for the
      // whole class.
      case "rect":
      case "image":
      case "use":
        return "vertex-box";

      case "circle":
        return "circle";

      case "ellipse":
        return "ellipse";

      case "path":
        return "path";

      // Text — deferred. text and tspan share a class for now; their
      // resize / rotate / vector-edit semantics depend on resolved font
      // metrics which the policy layer cannot observe.
      case "text":
      case "tspan":
        return "text";

      // Group — deferred. A <g> has no intrinsic geometry; its bounds
      // are the union of its children's bounds in the group's local
      // space.
      case "g":
        return "group";

      // Everything else (containers, defs, paint servers, filters, …)
      // is not editable as geometry by the Policy Class layer.
      default:
        return "none";
    }
  }

  // ─── Table 2 — Solution space per (PolicyClass × Intent) ─────────────
  //
  // Each cell is the set of legal `Solution`s. An absent / empty entry
  // means the class rejects the intent (the capability gate returns
  // false).
  //
  // The shape mirrors the doc's Table 2 row-by-row.

  const SOLUTION_SPACE: Record<
    PolicyClass,
    Partial<Record<Intent, SolutionSpace>>
  > = {
    // VertexChain — line, polyline, polygon.
    "vertex-chain": {
      resize: ["bake"],
      translate: ["bake", "via-transform"],
      rotate: ["via-transform"],
      "enter-vector-edit": ["bake"],
      "translate-vertex": ["bake"],
      // transform-vertices (Vertex Transform Box, #881) — always bake,
      // count- and type-preserving: scaling / rotating the selected vertex
      // positions keeps tangents zero, so the chain stays a native
      // line/polyline/polygon (no promote, no restrict fork).
      "transform-vertices": ["bake"],
      "insert-vertex": ["bake"],
      "delete-vertex": ["bake", "restrict"],
      "close-shape": ["promote"],
      "open-shape": ["promote"],
      // insert-tangent / adjust-tangent / convert-segment-type /
      // adjust-arc-radii / split-sub-path — n/a (no curvature concept).
    },

    // VertexBox — rect, image, use.
    "vertex-box": {
      resize: ["bake"],
      translate: ["bake", "via-transform"],
      rotate: ["via-transform"],
      // All vector-edit sub-intents — rejected. v1 declares this
      // explicitly.
    },

    // Circle — the canonical fork case. Non-uniform resize has 3 legal
    // solutions; v1 picks `restrict`.
    circle: {
      resize: ["restrict", "promote", "via-transform"],
      translate: ["bake"],
      rotate: ["via-transform"],
    },

    // Ellipse — resize has a 2-way fork; rotate is single-solution
    // because rotating an axis-aligned ellipse violates
    // `axis_aligned_radii` and baking would force conversion.
    ellipse: {
      resize: ["bake", "via-transform"],
      translate: ["bake"],
      rotate: ["via-transform"],
    },

    // Path — universal geometry. Most intents have a 2-way fork (bake
    // into d / via-transform); vector-edit sub-intents are the most
    // numerous of any class.
    path: {
      resize: ["bake", "via-transform"],
      translate: ["bake", "via-transform"],
      rotate: ["bake", "via-transform"],
      "enter-vector-edit": ["bake"],
      "translate-vertex": ["bake"],
      "transform-vertices": ["bake"],
      "insert-vertex": ["bake"],
      "delete-vertex": ["bake"],
      "close-shape": ["bake"],
      "open-shape": ["bake"],
      "insert-tangent": ["bake"],
      "adjust-tangent": ["bake"],
      "convert-segment-type": ["bake"],
      "adjust-arc-radii": ["bake"],
      "split-sub-path": ["bake"],
    },

    text: {},

    // Group — translate and rotate via-T only; no other intents.
    group: {
      translate: ["via-transform"],
      rotate: ["via-transform"],
    },

    // None — sentinel for non-geometric containers. No intents apply.
    none: {},
  };

  // ─── Table 3 — Editor's chosen policy in v1 ──────────────────────────
  //
  // One Solution per (PolicyClass, Intent) cell. Absent entries mean:
  //   - the cell is rejected (no policy), or
  //   - the cell is not yet implemented in v1.
  //
  // Cross-check: every CHOSEN_POLICY entry must appear in the
  // corresponding SOLUTION_SPACE cell (invariant I2). Test enforces.

  const CHOSEN_POLICY: Record<
    PolicyClass,
    Partial<Record<Intent, Solution>>
  > = {
    "vertex-chain": {
      resize: "bake",
      translate: "bake", // per-instance dispatch may pick via-transform
      rotate: "via-transform",
      "enter-vector-edit": "bake",
      "translate-vertex": "bake",
      "transform-vertices": "bake",
      "insert-vertex": "bake",
      "delete-vertex": "restrict", // conservative v1: refuse below the minimum
      "close-shape": "promote",
      "open-shape": "promote",
    },

    "vertex-box": {
      resize: "bake",
      translate: "bake",
      rotate: "via-transform",
    },

    circle: {
      resize: "restrict", // v1 forces uniform scale via `s = min(sx, sy)`
      translate: "bake",
      rotate: "via-transform",
    },

    ellipse: {
      resize: "bake",
      translate: "bake",
      rotate: "via-transform",
    },

    path: {
      resize: "bake", // current: scale_path_d via svg-pathdata MATRIX
      translate: "bake",
      rotate: "via-transform",
      "transform-vertices": "bake", // single mandated solution (#881)
    },

    text: {},

    group: {
      translate: "via-transform",
      rotate: "via-transform",
    },

    none: {},
  };

  // ─── Public lookups ──────────────────────────────────────────────────

  /** Shared empty solution-space — returned on misses to avoid per-call
   *  array allocation. */
  const EMPTY: SolutionSpace = Object.freeze([]) as SolutionSpace;

  /**
   * The set of legal solutions for a (class, intent) cell.
   *
   * Returns an empty readonly array if the class rejects the intent
   * (the capability gate is false). Length 1 means the intent has a
   * single mandated behavior. Length ≥ 2 means the cell has a host-
   * configurable policy decision.
   *
   * @see {@link accepts} — fast capability test
   * @see {@link fork_count} — solution count alias
   */
  export function legal_solutions(
    cls: PolicyClass,
    intent: Intent
  ): SolutionSpace {
    return SOLUTION_SPACE[cls][intent] ?? EMPTY;
  }

  /**
   * The single Solution v1 picks for this (class, intent) cell, or
   * `undefined` if no chosen policy is declared (either because the
   * class rejects the intent or because the implementation defers it).
   *
   * **This is the class-level default.** Some intents have legitimate
   * per-instance overrides driven by attribute state — most notably
   * Translate, where the runtime may pick `via-transform` instead of
   * the class default `bake` when the element already carries a
   * `transform=` attribute. Such overrides live in the dispatcher's
   * per-instance baseline-capture step, not in this table. Policy
   * Class is the class-scoped authority; per-instance state is layered
   * above it.
   *
   * Invariant: when defined, the returned Solution is a member of
   * `legal_solutions(cls, intent)`. Test enforces.
   */
  export function chosen_policy(
    cls: PolicyClass,
    intent: Intent
  ): Solution | undefined {
    return CHOSEN_POLICY[cls][intent];
  }

  /**
   * Capability gate: does this class accept this intent at all?
   *
   * Equivalent to `legal_solutions(cls, intent).length > 0`. Provided
   * as a named function so call sites read at the right level of
   * intent ("can I even dispatch this?" vs. "what are the options?").
   */
  export function accepts(cls: PolicyClass, intent: Intent): boolean {
    return legal_solutions(cls, intent).length > 0;
  }

  /**
   * How many legal solutions does this (class, intent) cell admit?
   *
   *   0 — the class rejects the intent
   *   1 — single mandated behavior, no policy decision
   *   ≥ 2 — host-configurable policy decision (the class earns its
   *         separateness on this intent)
   *
   * Useful in tests and reviews when the question is "is this a fork-
   * causing cell?" rather than "what are the options?".
   */
  export function fork_count(cls: PolicyClass, intent: Intent): number {
    return legal_solutions(cls, intent).length;
  }

  // ─── Test-time access to raw tables ──────────────────────────────────
  //
  // The raw tables are exported for the cross-consistency tests in
  // `__tests__/policy-class/`. They are not part of the package's
  // public API — consumers should use the four lookup functions above.

  export const _internal_SOLUTION_SPACE = SOLUTION_SPACE;
  export const _internal_CHOSEN_POLICY = CHOSEN_POLICY;
}
