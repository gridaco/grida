/**
 * Editor-local bridge to `react-hotkeys-hook`.
 *
 * These helpers convert `@grida/keybinding` types into the lowercased
 * string format expected by react-hotkeys-hook. They live in the main
 * editor (not the shared `@grida/keybinding` package) because the
 * package intentionally has no opinion on hotkey runtimes.
 */

import {
  KeyCode,
  keybindingsToKeyCodes,
  type Keybinding,
  type Platform,
} from "@grida/keybinding";

/**
 * Map a `KeyCode` to the lowercased string expected by `react-hotkeys-hook`.
 *
 * Examples: `KeyCode.UpArrow` → `"arrowup"`, `KeyCode.KeyD` → `"d"`,
 * `KeyCode.Meta` → `"meta"`.
 */
export function keyCodeToHotkeyStr(kc: KeyCode): string {
  switch (kc) {
    case KeyCode.Backspace:
      return "backspace";
    case KeyCode.Tab:
      return "tab";
    case KeyCode.Enter:
      return "enter";
    case KeyCode.Shift:
      return "shift";
    case KeyCode.Ctrl:
      return "ctrl";
    case KeyCode.Alt:
      return "alt";
    case KeyCode.Escape:
      return "escape";
    case KeyCode.Space:
      return "space";
    case KeyCode.PageUp:
      return "pageup";
    case KeyCode.PageDown:
      return "pagedown";
    case KeyCode.End:
      return "end";
    case KeyCode.Home:
      return "home";
    case KeyCode.LeftArrow:
      return "arrowleft";
    case KeyCode.UpArrow:
      return "arrowup";
    case KeyCode.RightArrow:
      return "arrowright";
    case KeyCode.DownArrow:
      return "arrowdown";
    case KeyCode.Delete:
      return "delete";
    case KeyCode.Meta:
      return "meta";
    default:
      break;
  }

  // Digit0–Digit9 → "0"–"9"
  if (kc >= KeyCode.Digit0 && kc <= KeyCode.Digit9) {
    return String(kc - KeyCode.Digit0);
  }
  // KeyA–KeyZ → "a"–"z"
  if (kc >= KeyCode.KeyA && kc <= KeyCode.KeyZ) {
    return String.fromCharCode("a".charCodeAt(0) + (kc - KeyCode.KeyA));
  }
  // F1–F24 → "f1"–"f24"
  if (kc >= KeyCode.F1 && kc <= KeyCode.F24) {
    return `f${kc - KeyCode.F1 + 1}`;
  }

  // Fallback — should not be reached for the keybindings we define.
  return "";
}

/**
 * Convert a `Keybinding` to a `react-hotkeys-hook` compatible string.
 *
 * Multiple aliases (sequences) are joined with `, ` which react-hotkeys-hook
 * interprets as alternative triggers.
 *
 * Note: multi-chunk sequences (chords like Ctrl+K, Ctrl+S) are NOT supported
 * by react-hotkeys-hook. Only the first chunk of each sequence is emitted.
 */
export function keybindingToHotkeysString(
  binding: Keybinding,
  platform?: Platform
): string {
  const resolved = keybindingsToKeyCodes(binding, platform);
  const strs: string[] = [];
  for (const seq of resolved) {
    const chunk = seq[0];
    if (!chunk) continue;
    const parts: string[] = [];
    for (const mod of chunk.mods) parts.push(keyCodeToHotkeyStr(mod));
    for (const key of chunk.keys) parts.push(keyCodeToHotkeyStr(key));
    strs.push(parts.join("+"));
  }
  return strs.join(", ");
}
