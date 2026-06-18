// Inline-style (`style="…"`) declaration-list parsing + trivia-preserving
// authoring.
//
// The `style` attribute value is an SVG attribute string whose content is a
// CSS declaration list (`prop: value; prop: value`). Per the `svg_parse` rule
// — every lexical parse of SVG content lives in this package, callers MUST NOT
// roll their own — this module is the single owner of that sub-grammar.
//
// It exists so an edit to ONE declaration rewrites only that declaration's
// value and re-emits every untouched sibling byte-for-byte. That is the
// minimal-diff round-trip invariant one syntax level below the attribute
// grammar's trivia model (`AttrToken`): editing `fill` must not churn the
// formatting of `stroke`.
//
// Scope (deliberate): this is NOT a full CSS tokenizer. CSS comments, and
// `;` / `:` nested inside parens or strings, are not modeled — a `;` inside a
// value still splits the list. Malformed or unmodeled segments are preserved
// verbatim (as `raw`) rather than rewritten, never matched by `set`.

/**
 * One `;`-delimited segment of a `style` value, retaining enough source trivia
 * to re-emit it byte-for-byte.
 *
 * A `decl` is a `property : value` pair split at its first colon. Any other
 * segment — the empty tail after a trailing `;`, a whitespace-only run, or a
 * colon-less / empty-property fragment — is preserved verbatim as `raw`.
 */
type Segment =
  | {
      kind: "decl";
      /** Whitespace before the property name. */
      pre: string;
      /** Property name, verbatim (no surrounding whitespace). Matched against
       *  on edit; projected by {@link inline_style.declarations}. */
      property: string;
      /** Verbatim bytes between the property name and the value — the `:` plus
       *  any whitespace around it. Opaque: only ever re-emitted, never read,
       *  so the colon/space form survives untouched. */
      sep: string;
      /** Value, verbatim middle (no surrounding whitespace). The only field an
       *  edit rewrites. */
      value: string;
      /** Whitespace after the value, before the separator / end. */
      post: string;
    }
  | { kind: "raw"; text: string };

/** Splits a string into (leading ws, middle, trailing ws). The middle is
 *  non-greedy so trailing whitespace lands in group 3; every part is optional,
 *  so this matches any input and the `!` on `.exec` is sound. */
const STYLE_TRIM = /^(\s*)([\s\S]*?)(\s*)$/;

/** `[leading ws, trimmed middle, trailing ws]` — the verbatim split a `decl`
 *  segment needs on both sides of its colon. */
function trim3(s: string): [string, string, string] {
  const [, pre, mid, post] = STYLE_TRIM.exec(s)!;
  return [pre, mid, post];
}

function tokenize(s: string): Segment[] {
  // The empty string is zero declarations — distinct from `";"`, which is one
  // empty trailing segment. Returning [] keeps add-to-empty from emitting a
  // spurious leading separator.
  if (s === "") return [];
  return s.split(";").map((seg): Segment => {
    const colon = seg.indexOf(":");
    if (colon === -1) return { kind: "raw", text: seg };
    const [pre, property, name_trailing] = trim3(seg.slice(0, colon));
    // A colon with no property name (`:value`) is not an editable declaration;
    // keep it verbatim so it round-trips and never matches `set`.
    if (property === "") return { kind: "raw", text: seg };
    const [value_leading, value, post] = trim3(seg.slice(colon + 1));
    return {
      kind: "decl",
      pre,
      property,
      sep: `${name_trailing}:${value_leading}`,
      value,
      post,
    };
  });
}

function emit(segs: Segment[]): string {
  return segs
    .map((seg) =>
      seg.kind === "raw"
        ? seg.text
        : `${seg.pre}${seg.property}${seg.sep}${seg.value}${seg.post}`
    )
    .join(";");
}

export namespace inline_style {
  /** A single CSS declaration projected from a `style` value: the trimmed
   *  property name and value, with all formatting trivia dropped. */
  export type Declaration = { property: string; value: string };

  /**
   * The declaration list of a `style` attribute value, in source order.
   *
   * Trimmed projection — colon-less and empty-property fragments are skipped
   * (they are not editable declarations). Returns `[]` for empty input. This
   * is the read view the cascade engine / inspector consume; it is derived
   * from the same tokenizer that {@link set} edits, so reads and writes can't
   * disagree about what a declaration is.
   */
  export function declarations(style: string): Declaration[] {
    const out: Declaration[] = [];
    for (const seg of tokenize(style)) {
      if (seg.kind === "decl")
        out.push({ property: seg.property, value: seg.value });
    }
    return out;
  }

  /**
   * The effective declared value of `property`, or `null` if absent.
   *
   * Returns the **last** matching declaration: CSS resolves declarations of
   * equal weight last-one-wins (CSS 2.1 §6.4.1), so for `fill:red;fill:blue`
   * the winner is `blue`. Keeps the cascade rule co-located with {@link set}
   * (which edits that same winner) so reads and writes agree.
   */
  export function get(style: string, property: string): string | null {
    let value: string | null = null;
    for (const seg of tokenize(style)) {
      if (seg.kind === "decl" && seg.property === property) value = seg.value;
    }
    return value;
  }

  /**
   * Return `style` with `property` set to `value`, or removed when `value` is
   * `null`. Trivia-preserving: the touched declaration's own colon/space form
   * and every untouched sibling re-emit byte-for-byte.
   *
   *  - Edit: only the **effective** (last, per CSS last-one-wins) declaration's
   *    value changes; any earlier shadowed duplicate is left byte-equal, so the
   *    edit is the one that actually wins the cascade.
   *  - Add (property absent): a canonical `property: value` is appended,
   *    inserted before a trailing empty segment so an authored trailing `;`
   *    stays trailing.
   *  - Remove: **every** declaration of `property` is dropped — a surviving
   *    duplicate would keep the property in the cascade. Other declarations
   *    stay byte-equal. Returns `""` when no declaration remains (so the caller
   *    can drop the attribute rather than emit a stray separator tail).
   *  - Remove of an absent property: returns the input unchanged.
   */
  export function set(
    style: string,
    property: string,
    value: string | null
  ): string {
    const segs = tokenize(style);
    if (value === null) {
      const kept = segs.filter(
        (s) => s.kind !== "decl" || s.property !== property
      );
      if (kept.length === segs.length) return style; // nothing matched
      // Only separators / whitespace left (no declaration): collapse so the
      // caller drops the attribute instead of emitting a stray `" "` / `";"`.
      if (!kept.some((s) => s.kind === "decl")) return "";
      return emit(kept);
    }
    // Edit / add target the LAST occurrence — the cascade winner — so the edit
    // is the effective one even when the property is authored more than once.
    let idx = -1;
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      if (s.kind === "decl" && s.property === property) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      const decl: Segment = {
        kind: "decl",
        pre: "",
        property,
        sep: ": ",
        value,
        post: "",
      };
      const tail = segs.length > 0 ? segs[segs.length - 1] : null;
      if (tail && tail.kind === "raw" && tail.text.trim() === "") {
        segs.splice(segs.length - 1, 0, decl);
      } else {
        segs.push(decl);
      }
    } else {
      const seg = segs[idx];
      if (seg.kind === "decl") seg.value = value;
    }
    return emit(segs);
  }
}
