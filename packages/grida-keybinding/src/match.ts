/**
 * Match a real DOM `KeyboardEvent` against a declarative `Keybinding`.
 *
 * This file is the only new code in this package; everything else is
 * copied from the main editor's `keybinding.ts` / `keycode.ts`. The
 * intent of `match.ts` is to let any host that owns its own keydown
 * listener (i.e. doesn't go through `react-hotkeys-hook`) ask the
 * passive question:
 *
 *     "does this DOM event satisfy this declarative binding?"
 *
 * and get a boolean. The host is then free to build its own command
 * registry / keymap / dispatch logic.
 *
 * V1 supports single-chunk sequences only. Two distinct multi-keystroke
 * concepts are deliberately OUT OF SCOPE here — keep them separate (see the
 * `Concepts` block in `keybinding.ts`):
 *
 *  1. **Chord-sequence** dispatch (`Ctrl+K Ctrl+C`) — typed in `Sequence` but
 *     not matched here. It needs a stateful matcher that tracks the leader
 *     chunk between events (timing, if any, is only a give-up watchdog). Add a
 *     dedicated resolver when needed; do not fold it into `match()`.
 *  2. **Multi-tap** (`0 0`, double-tap-Shift) — same-key timed repetition is a
 *     **clock-driven gesture**, not a binding `match()` can answer. It is not a
 *     `Sequence` and these primitives stay clockless. The pointer-side
 *     precedent for "consecutive same-event within a window" lives in
 *     `@grida/canvas-hud` (`core/click-tracker.ts`); the keyboard analogue, if
 *     built, belongs in the dispatcher/surface layer, never here.
 *
 * This matcher therefore skips any sequence with `length !== 1`.
 */

import { KeyCode } from "./keycode";
import {
  keybindingsToKeyCodes,
  type Keybinding,
  type Platform,
  type ResolvedChunk,
} from "./keybinding";

// ---------------------------------------------------------------------------
// event.code → KeyCode mapping
// ---------------------------------------------------------------------------

/**
 * Browser `KeyboardEvent.code` values that map cleanly to our `KeyCode`
 * enum. We intentionally rely on `event.code` rather than `event.key`
 * because `code` is layout-independent — "KeyZ" stays "KeyZ" on
 * Dvorak/Colemak; "z"/"Z" varies.
 *
 * Only the codes used by current and near-term bindings are listed.
 * Unknown codes resolve to `KeyCode.Unknown` and never match anything.
 */
const CODE_TO_KEYCODE: Partial<Record<string, KeyCode>> = {
  // Letters: derived in code() below (KeyA–KeyZ ↔ Code "KeyA"–"KeyZ").
  // Digits: derived in code() below.

  Backspace: KeyCode.Backspace,
  Tab: KeyCode.Tab,
  Enter: KeyCode.Enter,
  NumpadEnter: KeyCode.Enter,
  Escape: KeyCode.Escape,
  Space: KeyCode.Space,
  PageUp: KeyCode.PageUp,
  PageDown: KeyCode.PageDown,
  End: KeyCode.End,
  Home: KeyCode.Home,
  ArrowLeft: KeyCode.LeftArrow,
  ArrowUp: KeyCode.UpArrow,
  ArrowRight: KeyCode.RightArrow,
  ArrowDown: KeyCode.DownArrow,
  Insert: KeyCode.Insert,
  Delete: KeyCode.Delete,
  Backslash: KeyCode.Backslash,
  Slash: KeyCode.Slash,
  Period: KeyCode.Period,
  Comma: KeyCode.Comma,
  Semicolon: KeyCode.Semicolon,
  Quote: KeyCode.Quote,
  BracketLeft: KeyCode.BracketLeft,
  BracketRight: KeyCode.BracketRight,
  Backquote: KeyCode.Backquote,
  Minus: KeyCode.Minus,
  Equal: KeyCode.Equal,

  // Modifier-only presses leave `keys` empty (mods already captured via
  // event.metaKey/ctrlKey/etc.). Don't map MetaLeft/ShiftLeft/etc.

  // Function keys
  F1: KeyCode.F1,
  F2: KeyCode.F2,
  F3: KeyCode.F3,
  F4: KeyCode.F4,
  F5: KeyCode.F5,
  F6: KeyCode.F6,
  F7: KeyCode.F7,
  F8: KeyCode.F8,
  F9: KeyCode.F9,
  F10: KeyCode.F10,
  F11: KeyCode.F11,
  F12: KeyCode.F12,
};

/** Resolve `KeyboardEvent.code` to a `KeyCode`. Unknown → `KeyCode.Unknown`. */
function codeToKeyCode(code: string): KeyCode {
  // Letters: "KeyA".."KeyZ" → KeyCode.KeyA..KeyZ
  if (code.length === 4 && code.startsWith("Key")) {
    const offset = code.charCodeAt(3) - 65; // 'A' = 65
    if (offset >= 0 && offset < 26) return KeyCode.KeyA + offset;
  }
  // Top-row digits: "Digit0".."Digit9" → KeyCode.Digit0..Digit9
  if (code.length === 6 && code.startsWith("Digit")) {
    const offset = code.charCodeAt(5) - 48; // '0' = 48
    if (offset >= 0 && offset < 10) return KeyCode.Digit0 + offset;
  }
  // Numpad digits map to the same logical digits.
  if (code.length === 7 && code.startsWith("Numpad")) {
    const offset = code.charCodeAt(6) - 48;
    if (offset >= 0 && offset < 10) return KeyCode.Digit0 + offset;
  }
  return CODE_TO_KEYCODE[code] ?? KeyCode.Unknown;
}

// ---------------------------------------------------------------------------
// event → chunk
// ---------------------------------------------------------------------------

/**
 * Convert a DOM `KeyboardEvent` to a `ResolvedChunk`. Modifiers come from
 * `event.{metaKey,ctrlKey,shiftKey,altKey}`. The pressed non-modifier key
 * (if any) is resolved from `event.code`.
 *
 * For a bare modifier press (e.g. just `Meta`), `keys` is empty — the
 * modifier is in `mods` already, and `event.code === "MetaLeft"` is not
 * in our mapping table.
 */
export function eventToChunk(event: KeyboardEvent): ResolvedChunk {
  const mods: KeyCode[] = [];
  if (event.metaKey) mods.push(KeyCode.Meta);
  if (event.ctrlKey) mods.push(KeyCode.Ctrl);
  if (event.shiftKey) mods.push(KeyCode.Shift);
  if (event.altKey) mods.push(KeyCode.Alt);

  const kc = codeToKeyCode(event.code);
  const keys: KeyCode[] = kc !== KeyCode.Unknown ? [kc] : [];

  return { mods, keys };
}

// ---------------------------------------------------------------------------
// chunk key (canonical hash)
// ---------------------------------------------------------------------------

/**
 * Canonical string hash for a `ResolvedChunk`. Modifier and key order
 * are normalized so two chunks that represent the same combination
 * produce the same hash regardless of input order.
 *
 * Used by consumers (e.g. `@grida/svg-editor`'s `Keymap`) to bucket
 * candidate bindings into a `Map<string, Binding[]>` without having to
 * re-resolve on every dispatch.
 */
export function chunkKey(chunk: ResolvedChunk): string {
  // Numeric sort — KeyCode enum values are integers.
  const sortedMods = [...chunk.mods].sort((a, b) => a - b);
  const sortedKeys = [...chunk.keys].sort((a, b) => a - b);
  return `${sortedMods.join(",")}|${sortedKeys.join(",")}`;
}

// ---------------------------------------------------------------------------
// match
// ---------------------------------------------------------------------------

/**
 * Does this DOM `event` satisfy any single-chunk sequence in `binding`?
 *
 * - `binding` may be a single sequence or an alias list (e.g. `Cmd+Z`
 *   and `Ctrl+Z` for cross-platform Undo).
 * - Multi-chunk sequences are skipped in V1.
 * - `platform` defaults to `getKeyboardOS()` — the active platform.
 *
 * Returns `true` on the first matching alias, otherwise `false`.
 */
export function match(
  event: KeyboardEvent,
  binding: Keybinding,
  platform?: Platform
): boolean {
  const eventChunk = eventToChunk(event);
  const eventHash = chunkKey(eventChunk);
  const sequences = keybindingsToKeyCodes(binding, platform);
  for (const seq of sequences) {
    if (seq.length !== 1) continue;
    if (chunkKey(seq[0]) === eventHash) return true;
  }
  return false;
}
