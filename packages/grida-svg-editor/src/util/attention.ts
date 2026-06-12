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
// What "attended" means here. The tracker watches an **attention scope**:
// the container, plus any host-chrome elements registered via `add()`
// (inspector, toolbar — editor-adjacent chrome that is a DOM sibling of the
// container by the exclusive-ownership rule). The surface is attended when
// at least one of:
//   - focus is inside the subtree of any element of the scope (active
//     element is that element or one of its descendants), OR
//   - the pointer is currently over any element of the scope
//     (`pointerenter` fired more recently than `pointerleave` on it).
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
   * `true` iff focus is inside the attention scope (the container's
   * subtree or a registered element's subtree) OR the pointer is
   * currently over any element of the scope. See module doc for the
   * rationale.
   *
   * Pure read; no DOM mutation. Cheap enough to call once per keydown.
   */
  is_attended(): boolean;
  /**
   * `true` iff focus is inside the attention scope — the focus arm of
   * {@link is_attended} alone, WITHOUT the pointer-over arm.
   *
   * Exists for the native clipboard gate (`dom.ts`): pointer-over is a
   * sufficient signal to claim a keystroke (worst case: a stolen scroll)
   * but NOT a copy/cut/paste gesture (worst case: destroying what the
   * user believed they copied, or routing a paste meant for a host text
   * field into the document). See docs/wg/feat-svg-editor/clipboard.md
   * §Transport "Gating the native events".
   */
  is_focus_within(): boolean;
  /**
   * Register a host-chrome element into the attention scope. Editor-
   * adjacent chrome — an inspector, a toolbar, a zoom menu; anything that
   * drives `commands.*` — is a DOM *sibling* of the container (the
   * container is exclusively surface-owned), so without registration the
   * tracker cannot tell it apart from unrelated page surface: clicking
   * its buttons moves focus out of the container, and hovering it fires
   * the container's `pointerleave`, blacking out the whole keymap.
   * Registered elements count for both arms — focus-within and
   * pointer-over. Idempotent; re-adding a registered element is a no-op.
   */
  add(element: Element): void;
  /**
   * Unregister an element added via {@link add}. Also clears any
   * still-latched pointer-over contribution from it (the element may be
   * unmounted mid-hover — e.g. a popover closing under the cursor).
   * Unknown elements are a no-op. The container itself cannot be
   * removed; it is the scope's fixed root, not a registered extra.
   */
  remove(element: Element): void;
  /** Detach the internal pointer-tracking listeners (container and every
   *  registered element). */
  dispose(): void;
}

/**
 * Install pointer-tracking listeners on `container` and return the
 * read-side handle. The tracker is owned by the surface and disposed
 * alongside it; gesture bindings that need to consult it receive the
 * read-only `is_attended` predicate through `GestureContext`. Hosts
 * extend the scope through `handle.attention` (`dom.ts`), which fronts
 * {@link AttentionTracker.add} / {@link AttentionTracker.remove}.
 */
export function create_attention_tracker(
  container: HTMLElement
): AttentionTracker {
  /** Elements of the scope the pointer is currently over. Per-element
   *  membership (not a single boolean) so crossing from the container
   *  onto overlapping registered chrome — `leave` and `enter` firing in
   *  either order — never reads as a gap in attention. */
  const hovered = new Set<Element>();
  /** Registered extras → their hover-tracking teardown. */
  const extras = new Map<Element, () => void>();

  /** Start hover-tracking `element`; returns the exact undo. */
  const track = (element: Element): (() => void) => {
    const enter = () => {
      hovered.add(element);
    };
    const leave = () => {
      hovered.delete(element);
    };
    // Use pointerenter / pointerleave (no bubbling, no fire-on-child-cross)
    // so we get a single transition per actual boundary crossing.
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    return () => {
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
      // The element may go away mid-hover (popover unmounting under the
      // cursor) — its pointerleave will never fire, so drop the latch.
      hovered.delete(element);
    };
  };

  const untrack_container = track(container);

  const is_focus_within = (): boolean => {
    const owner = container.ownerDocument;
    if (!owner) return false;
    const active = owner.activeElement;
    // Body-focus alone is the embedded reading state — never attended.
    if (!active || active === owner.body) return false;
    // Focus inside the surface's subtree counts. `contains(self)` is true,
    // so this also covers "the container itself is focused" (e.g. tabindex).
    if (container.contains(active)) return true;
    for (const element of extras.keys()) {
      if (element.contains(active)) return true;
    }
    return false;
  };

  const is_attended = (): boolean => {
    return hovered.size > 0 || is_focus_within();
  };

  return {
    is_attended,
    is_focus_within,
    add: (element: Element) => {
      if (element === container || extras.has(element)) return;
      extras.set(element, track(element));
    },
    remove: (element: Element) => {
      const untrack = extras.get(element);
      if (!untrack) return;
      extras.delete(element);
      untrack();
    },
    dispose: () => {
      untrack_container();
      for (const untrack of extras.values()) untrack();
      extras.clear();
    },
  };
}
