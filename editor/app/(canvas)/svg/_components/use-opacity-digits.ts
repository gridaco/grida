"use client";

import { useEffect, useRef } from "react";
import { useSvgEditor } from "@grida/svg-editor/react";
import { toast } from "sonner";

const DOUBLE_PRESS_MS = 300;

/**
 * Host-owned digit → opacity shortcut for the SVG editor demos.
 *
 * `@grida/svg-editor` ships the `set_opacity` COMMAND but deliberately NOT the
 * digit keybindings (issue #850). The reason is an ownership rule, not a
 * dependency gap: an opacity change is **not self-evident** on the canvas — a
 * subtle drop can pass unnoticed — so the binding's UX is only complete with
 * host-rendered feedback (a toast), which a headless editor structurally cannot
 * emit (notification chrome is a host concern). The binding therefore lives
 * with the feedback: here, in the host. Self-evident bindings (nudge, delete,
 * align) stay svg-editor defaults; invisible-result ones are host territory.
 *
 * Behavior mirrors Grida Canvas — single-digit, no two-digit accumulation:
 *   - `1`–`9` → 10%–90%
 *   - `0` single → 100%
 *   - `0` double (within {@link DOUBLE_PRESS_MS}) → 0%
 *
 * The `0` single/double is the host's clock to own (the keybinding primitives
 * are clockless by charter); we use the same fire-immediately-then-correct
 * shape as the main canvas editor's `useSingleDoublePressHotkey`.
 */
export function useOpacityDigitsHotkeys(opts?: { enabled?: boolean }): void {
  const editor = useSvgEditor();
  const enabled = opts?.enabled ?? true;
  const last_zero_at = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const apply = (value: number) => {
      editor.commands.set_opacity(value);
      toast.success(`Opacity ${Math.round(value * 100)}%`);
    };

    const on_key_down = (e: KeyboardEvent) => {
      // Modifier chords belong to other shortcuts (Cmd+0 zoom-to-100, etc.).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Ignore OS key-repeat (held key) — one press = one opacity step, not a
      // flood of identical history entries + toasts.
      if (e.repeat) return;

      const digit = digit_from_code(e.code);
      if (digit === null) return;

      // Gate: something selected, normal select mode (not inline text/vector
      // edit), and not typing into host chrome (inspector inputs, AI chat,
      // doc-name field, …). Read live from `editor.state` so the listener
      // never re-attaches on selection change.
      if (editor.state.selection.length === 0) return;
      if (editor.state.mode !== "select") return;
      if (is_text_entry(document.activeElement)) return;

      e.preventDefault();

      if (digit === 0) {
        // `Date.now()` (not `e.timeStamp`): the ref starts at 0, and epoch-ms
        // is always >> the 300ms window, so the FIRST `0` press is correctly a
        // single (100%). `e.timeStamp` is page-relative and can be < 300 near
        // load, which would misfire the first press to 0%.
        const now = Date.now();
        const is_double = now - last_zero_at.current < DOUBLE_PRESS_MS;
        last_zero_at.current = now;
        apply(is_double ? 0 : 1);
      } else {
        apply(digit / 10);
      }
    };

    document.addEventListener("keydown", on_key_down);
    return () => document.removeEventListener("keydown", on_key_down);
  }, [editor, enabled]);
}

/** Top-row (`Digit0`–`Digit9`) and numpad (`Numpad0`–`Numpad9`) → 0–9. */
function digit_from_code(code: string): number | null {
  if (code.length === 6 && code.startsWith("Digit")) {
    const d = code.charCodeAt(5) - 48;
    if (d >= 0 && d <= 9) return d;
  }
  if (code.length === 7 && code.startsWith("Numpad")) {
    const d = code.charCodeAt(6) - 48;
    if (d >= 0 && d <= 9) return d;
  }
  return null;
}

/** Is focus inside a host form field that should swallow digit keys? */
function is_text_entry(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}
