// Attention gate — pins the contract that prevents the surface from claiming
// page-level keyboard shortcuts when nothing signals interest in it.
//
// Two layers covered here:
//   1. `create_attention_tracker(container)` — the standalone predicate that
//      reports whether focus is inside the container's subtree or the
//      pointer is over the container.
//   2. The default keydown-claiming gesture bindings (`KEYBOARD_ZOOM`,
//      `SPACE_DRAG_PAN`) — assert they consult `is_attended` before
//      calling `preventDefault()`.
//
// The package's test config is node-only (no jsdom), so this file builds
// minimal fakes that implement only the surface the code under test reads.
// Tests must read as "given this DOM state, this listener does/doesn't
// preventDefault" — no consumer is named.

import { describe, expect, it } from "vitest";
import { create_attention_tracker } from "../src/util/attention";

// ─── Fake DOM scaffolding ────────────────────────────────────────────────

type FakeListener = (e: unknown) => void;

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<FakeListener>>();
  addEventListener(name: string, fn: FakeListener): void {
    const set = this.listeners.get(name) ?? new Set();
    set.add(fn);
    this.listeners.set(name, set);
  }
  removeEventListener(name: string, fn: FakeListener): void {
    this.listeners.get(name)?.delete(fn);
  }
  /** Test-only — fire a synthetic event into installed listeners. */
  fire(name: string, payload: unknown = {}): void {
    for (const fn of this.listeners.get(name) ?? new Set()) fn(payload);
  }
  /** Test-only — does anything listen on this name? */
  has(name: string): boolean {
    return (this.listeners.get(name)?.size ?? 0) > 0;
  }
}

class FakeContainer extends FakeEventTarget {
  // Properties read by the tracker / gesture installers.
  readonly style: { cursor: string } = { cursor: "" };
  readonly children = [] as const;
  readonly ownerDocument: FakeOwnerDocument;
  /** Whether `contains(active)` should return true. Set by tests. */
  private focused_descendants = new Set<object>();

  constructor() {
    super();
    this.ownerDocument = new FakeOwnerDocument(this);
  }

  contains(node: object | null): boolean {
    if (!node) return false;
    if (node === this) return true;
    return this.focused_descendants.has(node);
  }
  /** Test-only — register `el` as a descendant of `container`. */
  add_descendant(el: object): void {
    this.focused_descendants.add(el);
  }
  /** Required by `SPACE_DRAG_PAN` cursor handling; harmless stub. */
  setPointerCapture(): void {
    /* no-op */
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
}

class FakeOwnerDocument extends FakeEventTarget {
  body = { tagName: "BODY" } as unknown as Element;
  activeElement: Element | null;
  readonly defaultView: FakeWindow;
  constructor(private readonly container: FakeContainer) {
    super();
    // Default reading state: focus is on body, no other signal.
    this.activeElement = this.body;
    this.defaultView = new FakeWindow();
  }
}

class FakeWindow extends FakeEventTarget {}

// ─── Predicate ───────────────────────────────────────────────────────────

describe("create_attention_tracker", () => {
  it("is NOT attended when focus is on body and pointer is not over the container", () => {
    const c = new FakeContainer();
    const t = create_attention_tracker(c as unknown as HTMLElement);
    // Default state set up by FakeOwnerDocument.
    expect(t.is_attended()).toBe(false);
    t.dispose();
  });

  it("is attended when focus is inside the container subtree", () => {
    const c = new FakeContainer();
    const child = { tagName: "DIV" };
    c.add_descendant(child);
    c.ownerDocument.activeElement = child as unknown as Element;
    const t = create_attention_tracker(c as unknown as HTMLElement);
    expect(t.is_attended()).toBe(true);
    t.dispose();
  });

  it("is attended when the container itself is the focused element", () => {
    const c = new FakeContainer();
    c.ownerDocument.activeElement = c as unknown as Element;
    const t = create_attention_tracker(c as unknown as HTMLElement);
    expect(t.is_attended()).toBe(true);
    t.dispose();
  });

  it("is NOT attended when focus is on a sibling element outside the subtree", () => {
    const c = new FakeContainer();
    const sibling = { tagName: "BUTTON" };
    // NOT added as descendant — contains(sibling) returns false.
    c.ownerDocument.activeElement = sibling as unknown as Element;
    const t = create_attention_tracker(c as unknown as HTMLElement);
    expect(t.is_attended()).toBe(false);
    t.dispose();
  });

  it("becomes attended on pointerenter and un-attended on pointerleave", () => {
    const c = new FakeContainer();
    const t = create_attention_tracker(c as unknown as HTMLElement);
    expect(t.is_attended()).toBe(false);
    c.fire("pointerenter");
    expect(t.is_attended()).toBe(true);
    c.fire("pointerleave");
    expect(t.is_attended()).toBe(false);
    t.dispose();
  });

  it("focus-inside wins even when pointer is not over the container", () => {
    const c = new FakeContainer();
    const child = { tagName: "INPUT" };
    c.add_descendant(child);
    c.ownerDocument.activeElement = child as unknown as Element;
    const t = create_attention_tracker(c as unknown as HTMLElement);
    // No pointerenter fired.
    expect(t.is_attended()).toBe(true);
    t.dispose();
  });

  it("dispose() removes the pointer listeners — subsequent fires don't flip state", () => {
    const c = new FakeContainer();
    const t = create_attention_tracker(c as unknown as HTMLElement);
    c.fire("pointerenter");
    expect(t.is_attended()).toBe(true);
    t.dispose();
    c.fire("pointerleave"); // no-op now
    // Activate again — listener is gone, state stays as last seen.
    c.fire("pointerenter");
    // Without pointer-over going true again, attended is computed from
    // (focus inside ∨ last_known_pointer_over). After dispose() neither
    // listener mutates the closure — but the stale state is fine for the
    // contract: the post-dispose predicate is undefined behavior and the
    // surface always disposes the tracker as part of teardown.
    // The assertion we care about is: removeEventListener was actually
    // called for both. Verify by counting set sizes.
    // (Indirect: the fake's `has` tells us whether anyone listens.)
    expect(c.has("pointerenter")).toBe(false);
    expect(c.has("pointerleave")).toBe(false);
  });
});

// ─── Gesture-level: KEYBOARD_ZOOM ────────────────────────────────────────
//
// Construct the binding's install context with a mock `is_attended` and
// assert the listener's preventDefault gate. The binding lives in the
// default set; we import the module and pull the binding by id so the
// test breaks if it's removed or renamed.

import { DEFAULT_GESTURE_BINDINGS } from "../src/gestures/defaults";
import type { GestureBinding, GestureContext } from "../src/gestures";

function find_binding(id: string): GestureBinding {
  const b = DEFAULT_GESTURE_BINDINGS.find((x) => x.id === id);
  if (!b) throw new Error(`gesture binding "${id}" not found`);
  return b;
}

function fake_context(
  container: FakeContainer,
  is_attended: () => boolean
): GestureContext {
  // Most fields are unused by the listeners under test. We provide
  // permissive stubs and rely on the binding's documented surface.
  const camera = {
    zoom: 1,
    pan: () => {},
    set_zoom: () => {},
    zoom_at: () => {},
    fit: () => {},
    reset: () => {},
  };
  return {
    container: container as unknown as HTMLElement,
    svg_root: () => null,
    hud_canvas: null as unknown as HTMLCanvasElement,
    camera: camera as unknown as GestureContext["camera"],
    editor: null as unknown as GestureContext["editor"],
    handle: { detach: () => {} },
    is_attended,
  };
}

function mk_kbd_event(
  init: Partial<{
    code: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    repeat: boolean;
    key: string;
  }>
): KeyboardEvent {
  let prevented = false;
  return {
    code: init.code ?? "",
    metaKey: !!init.metaKey,
    ctrlKey: !!init.ctrlKey,
    shiftKey: !!init.shiftKey,
    altKey: !!init.altKey,
    repeat: !!init.repeat,
    key: init.key ?? "",
    preventDefault() {
      prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  } as unknown as KeyboardEvent;
}

describe("keyboard-zoom gesture — attention gate", () => {
  it("ignores Shift+0 when the surface is not attended", () => {
    const c = new FakeContainer();
    const binding = find_binding("keyboard-zoom");
    const uninstall = binding.install(fake_context(c, () => false));
    const e = mk_kbd_event({ code: "Digit0", shiftKey: true });
    c.ownerDocument.fire("keydown", e);
    expect(e.defaultPrevented).toBe(false);
    uninstall();
  });

  it("ignores Cmd+= when the surface is not attended", () => {
    const c = new FakeContainer();
    const binding = find_binding("keyboard-zoom");
    const uninstall = binding.install(fake_context(c, () => false));
    const e = mk_kbd_event({ code: "Equal", metaKey: true });
    c.ownerDocument.fire("keydown", e);
    expect(e.defaultPrevented).toBe(false);
    uninstall();
  });

  it("claims Shift+0 when the surface IS attended", () => {
    const c = new FakeContainer();
    const binding = find_binding("keyboard-zoom");
    const uninstall = binding.install(fake_context(c, () => true));
    const e = mk_kbd_event({ code: "Digit0", shiftKey: true });
    c.ownerDocument.fire("keydown", e);
    expect(e.defaultPrevented).toBe(true);
    uninstall();
  });

  it("claims Cmd+= when the surface IS attended", () => {
    const c = new FakeContainer();
    const binding = find_binding("keyboard-zoom");
    const uninstall = binding.install(fake_context(c, () => true));
    const e = mk_kbd_event({ code: "Equal", metaKey: true });
    c.ownerDocument.fire("keydown", e);
    expect(e.defaultPrevented).toBe(true);
    uninstall();
  });
});

describe("space-drag-pan gesture — attention gate", () => {
  it("does NOT preventDefault on Space when the surface is not attended", () => {
    const c = new FakeContainer();
    const binding = find_binding("space-drag-pan");
    const uninstall = binding.install(fake_context(c, () => false));
    const e = mk_kbd_event({ code: "Space" });
    c.ownerDocument.defaultView.fire("keydown", e);
    expect(e.defaultPrevented).toBe(false);
    uninstall();
  });

  it("preventDefaults Space when the surface IS attended", () => {
    const c = new FakeContainer();
    const binding = find_binding("space-drag-pan");
    const uninstall = binding.install(fake_context(c, () => true));
    const e = mk_kbd_event({ code: "Space" });
    c.ownerDocument.defaultView.fire("keydown", e);
    expect(e.defaultPrevented).toBe(true);
    uninstall();
  });
});
