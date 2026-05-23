import { describe, expect, it, vi } from "vitest";
import { kb, KeyCode, M } from "@grida/keybinding";
import { CommandRegistry } from "../src/commands/registry";
import { Keymap } from "../src/keymap/keymap";

function mkEvent(opts: {
  code: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  let prevented = false;
  return {
    code: opts.code,
    metaKey: !!opts.metaKey,
    ctrlKey: !!opts.ctrlKey,
    shiftKey: !!opts.shiftKey,
    altKey: !!opts.altKey,
    preventDefault: () => {
      prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  } as unknown as KeyboardEvent;
}

function setup() {
  const registry = new CommandRegistry();
  const keymap = new Keymap(registry, () => "mac");
  return { registry, keymap };
}

describe("Keymap.dispatch", () => {
  it("invokes a command bound to a single key", () => {
    const { registry, keymap } = setup();
    const handler = vi.fn<() => boolean>(() => true);
    registry.register("test.cmd", handler);
    keymap.bind({
      keybinding: kb(KeyCode.KeyZ, M.CtrlCmd),
      command: "test.cmd",
    });

    const handled = keymap.dispatch(mkEvent({ code: "KeyZ", metaKey: true }));
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns false when no binding matches", () => {
    const { keymap } = setup();
    expect(keymap.dispatch(mkEvent({ code: "KeyA" }))).toBe(false);
  });

  it("returns false when handler returns false (no chain match)", () => {
    const { registry, keymap } = setup();
    registry.register("test.cmd", () => false);
    keymap.bind({
      keybinding: kb(KeyCode.KeyZ, M.CtrlCmd),
      command: "test.cmd",
    });
    expect(keymap.dispatch(mkEvent({ code: "KeyZ", metaKey: true }))).toBe(
      false
    );
  });

  it("does not call preventDefault — dispatch is browser-agnostic", () => {
    // The keymap doesn't touch the event. The host applies the policy
    // (preventDefault on claim). See README → editor.keymap.
    const { registry, keymap } = setup();
    registry.register("test.cmd", () => true);
    keymap.bind({ keybinding: kb(KeyCode.Escape), command: "test.cmd" });
    const e = mkEvent({ code: "Escape" });
    keymap.dispatch(e);
    expect(e.defaultPrevented).toBe(false);
  });
});

describe("Keymap.claims", () => {
  it("returns true when a binding exists for the chord", () => {
    const { registry, keymap } = setup();
    registry.register("test.cmd", () => true);
    keymap.bind({
      keybinding: kb(KeyCode.KeyG, M.CtrlCmd),
      command: "test.cmd",
    });
    expect(keymap.claims(mkEvent({ code: "KeyG", metaKey: true }))).toBe(true);
  });

  it("returns true even when the handler would reject — claim is independent of consumption", () => {
    // This is the key UX rule: an advertised shortcut shouldn't fall
    // through to the browser default just because its handler rejected.
    const { registry, keymap } = setup();
    registry.register("test.cmd", () => false);
    keymap.bind({
      keybinding: kb(KeyCode.KeyG, M.CtrlCmd),
      command: "test.cmd",
    });
    expect(keymap.claims(mkEvent({ code: "KeyG", metaKey: true }))).toBe(true);
    expect(keymap.dispatch(mkEvent({ code: "KeyG", metaKey: true }))).toBe(
      false
    );
  });

  it("returns false when no binding matches", () => {
    const { keymap } = setup();
    expect(keymap.claims(mkEvent({ code: "KeyG", metaKey: true }))).toBe(false);
  });

  it("returns false on a bare modifier press", () => {
    const { keymap } = setup();
    expect(keymap.claims(mkEvent({ code: "MetaLeft", metaKey: true }))).toBe(
      false
    );
  });

  it("runs no side effects — handlers are not invoked", () => {
    const { registry, keymap } = setup();
    const handler = vi.fn<() => boolean>(() => true);
    registry.register("test.cmd", handler);
    keymap.bind({ keybinding: kb(KeyCode.Escape), command: "test.cmd" });
    keymap.claims(mkEvent({ code: "Escape" }));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Keymap.dispatch (chain & focus)", () => {
  it("chains: tries candidates in priority order; first true wins", () => {
    const { registry, keymap } = setup();
    const first = vi.fn<() => boolean>(() => false);
    const second = vi.fn<() => boolean>(() => true);
    const third = vi.fn<() => boolean>(() => true);
    registry.register("first", first);
    registry.register("second", second);
    registry.register("third", third);
    keymap.bind({
      keybinding: kb(KeyCode.Escape),
      command: "first",
      priority: 10,
    });
    keymap.bind({
      keybinding: kb(KeyCode.Escape),
      command: "second",
      priority: 5,
    });
    keymap.bind({
      keybinding: kb(KeyCode.Escape),
      command: "third",
      priority: 1,
    });

    expect(keymap.dispatch(mkEvent({ code: "Escape" }))).toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(third).not.toHaveBeenCalled();
  });

  it("falls through if all candidates return false", () => {
    const { registry, keymap } = setup();
    registry.register("a", () => false);
    registry.register("b", () => false);
    keymap.bind({ keybinding: kb(KeyCode.Escape), command: "a" });
    keymap.bind({ keybinding: kb(KeyCode.Escape), command: "b" });
    expect(keymap.dispatch(mkEvent({ code: "Escape" }))).toBe(false);
  });

  it("ignores bare modifier presses (event.code = MetaLeft)", () => {
    const { registry, keymap } = setup();
    const handler = vi.fn<() => boolean>(() => true);
    registry.register("never.fires", handler);
    // No binding can match an empty `keys` chunk; but dispatch should
    // short-circuit before consulting the bucket map.
    expect(keymap.dispatch(mkEvent({ code: "MetaLeft", metaKey: true }))).toBe(
      false
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("unbind by command removes the binding", () => {
    const { registry, keymap } = setup();
    registry.register("c", () => true);
    keymap.bind({ keybinding: kb(KeyCode.Escape), command: "c" });
    keymap.unbind({ command: "c" });
    expect(keymap.dispatch(mkEvent({ code: "Escape" }))).toBe(false);
  });

  it("bind() returns an unbind function", () => {
    const { registry, keymap } = setup();
    registry.register("c", () => true);
    const off = keymap.bind({
      keybinding: kb(KeyCode.Escape),
      command: "c",
    });
    off();
    expect(keymap.dispatch(mkEvent({ code: "Escape" }))).toBe(false);
  });
});

describe("Keymap text-input focus suppression", () => {
  /**
   * Stub a focused element on the global `document`. The Keymap's
   * `is_text_input_focused()` reads `document.activeElement`, so this
   * is enough — we don't need a real DOM. Returns a restore function.
   */
  function with_active(
    el: { tagName: string; isContentEditable?: boolean } | null,
    fn: () => void
  ) {
    // Build a minimal global.document if one doesn't exist (node env).
    const g = globalThis as { document?: unknown };
    const original = g.document;
    g.document = { activeElement: el } as unknown as Document;
    try {
      fn();
    } finally {
      g.document = original;
    }
  }

  it("suppresses single-key bindings when an INPUT is focused", () => {
    const { registry, keymap } = setup();
    const handler = vi.fn<() => boolean>(() => true);
    registry.register("c", handler);
    keymap.bind({ keybinding: kb(KeyCode.Backspace), command: "c" });

    with_active({ tagName: "INPUT" }, () => {
      expect(keymap.dispatch(mkEvent({ code: "Backspace" }))).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  it("suppresses single-key bindings when a TEXTAREA is focused", () => {
    const { registry, keymap } = setup();
    const handler = vi.fn<() => boolean>(() => true);
    registry.register("c", handler);
    keymap.bind({ keybinding: kb(KeyCode.Backspace), command: "c" });

    with_active({ tagName: "TEXTAREA" }, () => {
      expect(keymap.dispatch(mkEvent({ code: "Backspace" }))).toBe(false);
    });
  });

  it("suppresses single-key bindings when contenteditable is focused", () => {
    const { registry, keymap } = setup();
    const handler = vi.fn<() => boolean>(() => true);
    registry.register("c", handler);
    keymap.bind({ keybinding: kb(KeyCode.Backspace), command: "c" });

    with_active({ tagName: "DIV", isContentEditable: true }, () => {
      expect(keymap.dispatch(mkEvent({ code: "Backspace" }))).toBe(false);
    });
  });

  it("suppresses modifier-chord bindings when an INPUT is focused (Cmd+A, Cmd+Z, etc. must reach the input)", () => {
    // Regression: previously, any binding with Cmd/Ctrl/Alt would override
    // input behavior, hijacking Cmd+A / Cmd+Z / Cmd+G inside a chat box or
    // text field. The contract now: bindings are suppressed in form
    // elements by default; opt in with `allowInFormElement: true`.
    const { registry, keymap } = setup();
    const handler = vi.fn<() => boolean>(() => true);
    registry.register("c", handler);
    keymap.bind({
      keybinding: kb(KeyCode.KeyA, M.CtrlCmd),
      command: "c",
    });

    with_active({ tagName: "INPUT" }, () => {
      expect(keymap.dispatch(mkEvent({ code: "KeyA", metaKey: true }))).toBe(
        false
      );
      expect(keymap.claims(mkEvent({ code: "KeyA", metaKey: true }))).toBe(
        false
      );
      expect(handler).not.toHaveBeenCalled();
    });
  });

  it("fires bindings inside form elements when `allowInFormElement: true`", () => {
    const { registry, keymap } = setup();
    const handler = vi.fn<() => boolean>(() => true);
    registry.register("c", handler);
    keymap.bind({
      keybinding: kb(KeyCode.KeyS, M.CtrlCmd),
      command: "c",
      allowInFormElement: true,
    });

    with_active({ tagName: "INPUT" }, () => {
      expect(keymap.dispatch(mkEvent({ code: "KeyS", metaKey: true }))).toBe(
        true
      );
      expect(keymap.claims(mkEvent({ code: "KeyS", metaKey: true }))).toBe(
        true
      );
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  it("fires single-key bindings when no input is focused", () => {
    const { registry, keymap } = setup();
    const handler = vi.fn<() => boolean>(() => true);
    registry.register("c", handler);
    keymap.bind({ keybinding: kb(KeyCode.Backspace), command: "c" });

    with_active(null, () => {
      expect(keymap.dispatch(mkEvent({ code: "Backspace" }))).toBe(true);
    });
  });
});
