import type { KeyEventLike } from "./types";

export { modeFromEvent } from "./selection";

/**
 * Built-in keymap actions. The library handles the structural ones
 * (`focus`, `expand`, `collapse`, `parent`, `select`) directly. Anything
 * else is forwarded to the consumer through the `intent` channel.
 */
export type KeymapAction =
  | "focus-prev"
  | "focus-next"
  | "focus-first"
  | "focus-last"
  | "focus-parent"
  | "expand"
  | "collapse"
  | "expand-or-noop"
  | "collapse-or-parent"
  | "toggle"
  | "select-focused"
  | "select-all"
  | "rename"
  | "delete"
  | "activate";

/**
 * Keymap is a flat `key → action` map. Modifiers are encoded in the key
 * with a stable order: `Cmd+Shift+X` → `"Cmd+Shift+X"`. Use `keyComboOf`
 * to derive the lookup key from a `KeyEventLike`.
 */
export type Keymap = Readonly<Record<string, KeymapAction | undefined>>;

/**
 * The Grida-recommended default. Consumers explicitly install this; it is
 * never wired automatically. Graphics tools typically install a reduced
 * subset (no `ArrowLeft` / `ArrowRight`) so canvas nudging works.
 */
export const defaultKeymap: Keymap = Object.freeze({
  ArrowUp: "focus-prev",
  ArrowDown: "focus-next",
  ArrowRight: "expand-or-noop",
  ArrowLeft: "collapse-or-parent",
  Home: "focus-first",
  End: "focus-last",
  Enter: "rename",
  F2: "rename",
  Delete: "delete",
  Backspace: "delete",
  "Mod+A": "select-all",
  "Shift+ArrowUp": "focus-prev",
  "Shift+ArrowDown": "focus-next",
  // Space selects the focused row. Modifiers compose via `modeFromEvent`:
  // plain Space → replace, Cmd/Ctrl+Space → toggle, Shift+Space → range.
  Space: "select-focused",
  "Shift+Space": "select-focused",
  "Mod+Space": "select-focused",
});

/**
 * Derive the lookup key for a `KeyEventLike`. Order is fixed:
 * `Mod` (meta/ctrl) → `Alt` → `Shift` → `key`.
 *
 * `Mod` collapses metaKey and ctrlKey to one token. Editors that need to
 * distinguish them should bypass `defaultKeymap` and dispatch on the raw
 * event.
 */
export function keyComboOf(event: KeyEventLike): string {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(normalizeKey(event.key));
  return parts.join("+");
}

/**
 * Normalize `KeyboardEvent.key` quirks so keymap entries can be written in
 * the obvious form. Currently maps the spacebar's literal " " to "Space".
 */
function normalizeKey(key: string): string {
  if (key === " ") return "Space";
  return key;
}

/**
 * Look up the action for an event in the given keymap. Tries the modified
 * combo first, then falls back to the bare key (so `ArrowUp` resolves
 * even when `Shift` is held).
 */
export function lookupAction(
  event: KeyEventLike,
  keymap: Keymap
): KeymapAction | undefined {
  const combo = keyComboOf(event);
  const direct = keymap[combo];
  if (direct) return direct;
  if (combo !== event.key) return keymap[event.key];
  return undefined;
}
