// Small DOM helpers shared between keymap and gestures modules.

/**
 * `true` when the document's active element is a text-input-like control
 * (input / textarea / contentEditable). Used by keymap + gesture defaults
 * to avoid hijacking keystrokes while the user is typing.
 */
export function is_text_input_focused(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}
