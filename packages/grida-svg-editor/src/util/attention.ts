// Attention tracker — gates document/window-level keydown listeners that call
// `preventDefault()` so the editor doesn't claim page-level shortcuts (Space,
// arrows, Cmd+=, Shift+0, …) when no user signal points at the editor.
//
// Why this exists. The DOM surface installs `keydown` on `owner_doc` and `win`
// for keymap claims (`dom.ts:on_keydown`), keyboard zoom (`KEYBOARD_ZOOM`),
// and Space-pan (`SPACE_DRAG_PAN`). All three call `preventDefault()` on
// match. When the surface is mounted as a block inside a larger scrollable
// document (article, dashboard, marketing page), the natural reading state is
// `activeElement === <body>` and the pointer is in the article margin. The
// unguarded listeners then steal Space (page scroll), arrows (page scroll),
// Cmd+= (browser zoom), Shift+0 (no-op for browser, but our refit fires).
// That's a producer concern: the surface owns its container exclusively
// (README → Surface), and "exclusively" should not extend its keyboard claim
// past the boundary the surface visibly draws on screen.
//
// What "attended" means here. The surface is attended when at least one of:
//   - focus is inside the container's subtree (active element is the
//     container or one of its descendants), OR
//   - the pointer is currently over the container (`pointerenter` fired more
//     recently than `pointerleave`).
//
// Body-focus alone (no descendant focused, no pointer over) is the embedded
// reading state — the editor is one block among many — and is *not* attended.
//
// Predicate composition. This is purely additive over the existing
// `is_text_input_focused()` guard: claim only when the surface is attended
// AND the active element is not a text input. The two guards are independent:
//   - `is_text_input_focused()` prevents stealing typing-shortcuts WHEN a
//     text field is focused (could be inside or outside the surface).
//   - `is_surface_attended()` prevents stealing anything WHEN nothing signals
//     interest in the surface.
//
// Passive observation listeners — modifier mirror (`IS_MODIFIER_KEY` keydown /
// keyup on `win`), `blur` resets, pointer-event listeners — are deliberately
// NOT gated. They don't call `preventDefault()`; they only update the
// surface's view of host state. Gating them would break "alt-hover paints
// measurement chips while focus is in a side panel" and similar cross-host
// flows where attention is signaled by the pointer alone.

/** The runtime handle returned by `create_attention_tracker`. */
export interface AttentionTracker {
  /**
   * `true` iff focus is inside `container`'s subtree OR the pointer is
   * currently over `container`. See module doc for the rationale.
   *
   * Pure read; no DOM mutation. Cheap enough to call once per keydown.
   */
  is_attended(): boolean;
  /** Detach the internal pointer-tracking listeners. */
  dispose(): void;
}

/**
 * Install pointer-tracking listeners on `container` and return the
 * read-side handle. The tracker is owned by the surface and disposed
 * alongside it; gesture bindings that need to consult it receive the
 * read-only `is_attended` predicate through `GestureContext`.
 */
export function create_attention_tracker(
  container: HTMLElement
): AttentionTracker {
  let pointer_over = false;
  const on_enter = () => {
    pointer_over = true;
  };
  const on_leave = () => {
    pointer_over = false;
  };
  // Use pointerenter / pointerleave (no bubbling, no fire-on-child-cross) so
  // we get a single transition per actual container boundary crossing.
  container.addEventListener("pointerenter", on_enter);
  container.addEventListener("pointerleave", on_leave);

  const is_attended = (): boolean => {
    const owner = container.ownerDocument;
    if (!owner) return pointer_over;
    const active = owner.activeElement;
    // Focus inside the surface's subtree counts. `contains(self)` is true,
    // so this also covers "the container itself is focused" (e.g. tabindex).
    if (active && active !== owner.body && container.contains(active)) {
      return true;
    }
    return pointer_over;
  };

  return {
    is_attended,
    dispose: () => {
      container.removeEventListener("pointerenter", on_enter);
      container.removeEventListener("pointerleave", on_leave);
    },
  };
}
