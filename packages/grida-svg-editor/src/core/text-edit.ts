// Text content-edit exit policy — pure, DOM-free.
//
// The empty-equals-delete rule (docs/wg/feat-svg-editor/text-tool.md) is a
// decision, not a mechanism: given how text-edit exited, what should happen
// to the node? Keeping that decision here — separate from the DOM surface
// that realizes it — makes the rule unit-testable without mounting a surface
// (the surface can't run under the headless test env). The surface only
// dispatches the returned action to the relevant primitive.

/** Whether the node being edited was created by this same gesture (the
 *  click-to-place text tool) or pre-existed it. The two differ only in undo
 *  treatment: a fresh node's creation+edit are one bracket (commit = one
 *  step, discard = no trace); a pre-existing node is mutated/removed as its
 *  own step. */
export type TextEditOrigin = "fresh" | "existing";

/**
 * What the surface should do when inline text content-editing exits.
 *
 *  - `commit_insert` / `discard_insert` — finalize the fresh-insert history
 *    bracket (keep as one undo step / roll back with no entry).
 *  - `remove` — delete a pre-existing node (one undo step; undo restores it).
 *  - `set_text` — write changed content to a pre-existing node.
 *  - `noop` — pre-existing node, content unchanged.
 */
export type TextExitAction =
  | { kind: "commit_insert" }
  | { kind: "discard_insert" }
  | { kind: "remove" }
  | { kind: "set_text"; value: string }
  | { kind: "noop" };

/**
 * Decide what happens when inline text content-editing exits.
 *
 * `result` is the text that should remain — the typed text on commit, the
 * original on cancel. "Empty" means zero-length: a space is authored
 * content and is kept. The rule is unconditional — an empty result deletes
 * the node however it got there (freshly placed and never typed, cleared by
 * the author, or already empty on entry).
 *
 * See docs/wg/feat-svg-editor/text-tool.md.
 */
export function resolve_text_exit(input: {
  origin: TextEditOrigin;
  result: string;
  original: string;
}): TextExitAction {
  const is_empty = input.result.length === 0;
  if (input.origin === "fresh") {
    return is_empty ? { kind: "discard_insert" } : { kind: "commit_insert" };
  }
  if (is_empty) return { kind: "remove" };
  if (input.result !== input.original) {
    return { kind: "set_text", value: input.result };
  }
  return { kind: "noop" };
}
