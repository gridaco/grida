import { describe, expect, it } from "vitest";
import { c, kb, seq, M, type Keybinding } from "../src/keybinding";
import { KeyCode } from "../src/keycode";
import { chunkKey, eventToChunk, match } from "../src/match";

/**
 * Tiny shim for a `KeyboardEvent`. Node's vitest environment doesn't ship
 * a real one, so we pass a structural mock — `match` reads only the
 * fields listed here.
 */
function mkEvent(opts: {
  code: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  return {
    code: opts.code,
    metaKey: !!opts.metaKey,
    ctrlKey: !!opts.ctrlKey,
    shiftKey: !!opts.shiftKey,
    altKey: !!opts.altKey,
  } as unknown as KeyboardEvent;
}

describe("eventToChunk", () => {
  it("maps a plain letter event", () => {
    const chunk = eventToChunk(mkEvent({ code: "KeyA" }));
    expect(chunk).toEqual({ mods: [], keys: [KeyCode.KeyA] });
  });

  it("captures Meta modifier from event", () => {
    const chunk = eventToChunk(mkEvent({ code: "KeyZ", metaKey: true }));
    expect(chunk.mods).toContain(KeyCode.Meta);
    expect(chunk.keys).toEqual([KeyCode.KeyZ]);
  });

  it("captures all modifiers", () => {
    const chunk = eventToChunk(
      mkEvent({
        code: "KeyP",
        metaKey: true,
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
      })
    );
    expect(chunk.mods.sort()).toEqual(
      [KeyCode.Meta, KeyCode.Ctrl, KeyCode.Shift, KeyCode.Alt].sort()
    );
    expect(chunk.keys).toEqual([KeyCode.KeyP]);
  });

  it("maps special keys via code table", () => {
    expect(eventToChunk(mkEvent({ code: "Escape" })).keys).toEqual([
      KeyCode.Escape,
    ]);
    expect(eventToChunk(mkEvent({ code: "Backspace" })).keys).toEqual([
      KeyCode.Backspace,
    ]);
    expect(eventToChunk(mkEvent({ code: "Delete" })).keys).toEqual([
      KeyCode.Delete,
    ]);
    expect(eventToChunk(mkEvent({ code: "ArrowUp" })).keys).toEqual([
      KeyCode.UpArrow,
    ]);
  });

  it("maps digit events", () => {
    expect(eventToChunk(mkEvent({ code: "Digit0" })).keys).toEqual([
      KeyCode.Digit0,
    ]);
    expect(eventToChunk(mkEvent({ code: "Digit9" })).keys).toEqual([
      KeyCode.Digit9,
    ]);
  });

  it("leaves keys empty for a bare modifier press (code = MetaLeft)", () => {
    const chunk = eventToChunk(mkEvent({ code: "MetaLeft", metaKey: true }));
    expect(chunk.keys).toEqual([]);
    expect(chunk.mods).toEqual([KeyCode.Meta]);
  });
});

describe("chunkKey", () => {
  it("produces a stable hash regardless of input order", () => {
    const a = chunkKey({
      mods: [KeyCode.Ctrl, KeyCode.Shift],
      keys: [KeyCode.KeyZ],
    });
    const b = chunkKey({
      mods: [KeyCode.Shift, KeyCode.Ctrl],
      keys: [KeyCode.KeyZ],
    });
    expect(a).toBe(b);
  });

  it("differs when modifier set differs", () => {
    const a = chunkKey({ mods: [KeyCode.Meta], keys: [KeyCode.KeyZ] });
    const b = chunkKey({
      mods: [KeyCode.Meta, KeyCode.Shift],
      keys: [KeyCode.KeyZ],
    });
    expect(a).not.toBe(b);
  });
});

describe("match", () => {
  it("matches a simple Mod+Z on mac", () => {
    const e = mkEvent({ code: "KeyZ", metaKey: true });
    expect(match(e, kb(KeyCode.KeyZ, M.CtrlCmd), "mac")).toBe(true);
  });

  it("matches the same binding on windows when Ctrl is pressed", () => {
    const e = mkEvent({ code: "KeyZ", ctrlKey: true });
    expect(match(e, kb(KeyCode.KeyZ, M.CtrlCmd), "windows")).toBe(true);
  });

  it("does NOT match Mod+Z on mac when only Ctrl is pressed", () => {
    const e = mkEvent({ code: "KeyZ", ctrlKey: true });
    expect(match(e, kb(KeyCode.KeyZ, M.CtrlCmd), "mac")).toBe(false);
  });

  it("matches Backspace with no mods", () => {
    expect(
      match(mkEvent({ code: "Backspace" }), kb(KeyCode.Backspace), "mac")
    ).toBe(true);
  });

  it("does NOT match Backspace when a modifier is held but binding has none", () => {
    const e = mkEvent({ code: "Backspace", metaKey: true });
    expect(match(e, kb(KeyCode.Backspace), "mac")).toBe(false);
  });

  it("matches Mod+Shift+Z on mac", () => {
    const e = mkEvent({ code: "KeyZ", metaKey: true, shiftKey: true });
    expect(match(e, kb(KeyCode.KeyZ, M.CtrlCmd | M.Shift), "mac")).toBe(true);
  });

  it("matches an alias list (multiple sequences)", () => {
    const aliases: Keybinding = [
      kb(KeyCode.KeyZ, M.CtrlCmd | M.Shift),
      kb(KeyCode.KeyY, M.CtrlCmd),
    ];
    const ev1 = mkEvent({ code: "KeyZ", metaKey: true, shiftKey: true });
    const ev2 = mkEvent({ code: "KeyY", metaKey: true });
    expect(match(ev1, aliases, "mac")).toBe(true);
    expect(match(ev2, aliases, "mac")).toBe(true);
  });

  it("returns false when the key is wrong", () => {
    expect(
      match(
        mkEvent({ code: "KeyA", metaKey: true }),
        kb(KeyCode.KeyZ, M.CtrlCmd),
        "mac"
      )
    ).toBe(false);
  });

  it("returns false for unknown event.code", () => {
    expect(match(mkEvent({ code: "Lang1" }), kb(KeyCode.KeyZ), "mac")).toBe(
      false
    );
  });

  it("matches single-chunk only — a multi-chunk sequence needs a stateful matcher not present in V1", () => {
    // `seq(Ctrl+K, Ctrl+C)` is a chord-sequence; a single keydown can never
    // satisfy it. match() skips `length !== 1`, so the first chunk does NOT
    // match on its own.
    const chordSeq = seq(
      c(M.CtrlCmd, KeyCode.KeyK),
      c(M.CtrlCmd, KeyCode.KeyC)
    );
    const ev = mkEvent({ code: "KeyK", metaKey: true });
    expect(match(ev, chordSeq, "mac")).toBe(false);
  });

  it("is stateless across events — a repeated key is never coalesced into a double-tap", () => {
    // `0 0` (multi-tap) is timing-disambiguated and out of scope. match() holds
    // no cross-event state and no clock: feeding two Digit0 events against a
    // repeated-chunk sequence matches neither time — there is no "double".
    const repeated = seq(c(0, KeyCode.Digit0), c(0, KeyCode.Digit0));
    const first = mkEvent({ code: "Digit0" });
    const second = mkEvent({ code: "Digit0" });
    expect(match(first, repeated)).toBe(false);
    expect(match(second, repeated)).toBe(false);
  });
});

describe("kb() modifier-mask semantics", () => {
  it("default mask is exact match: kb(key) only fires with no mods", () => {
    const b = kb(KeyCode.LeftArrow);
    expect(match(mkEvent({ code: "ArrowLeft" }), b, "mac")).toBe(true);
    expect(
      match(mkEvent({ code: "ArrowLeft", shiftKey: true }), b, "mac")
    ).toBe(false);
    expect(match(mkEvent({ code: "ArrowLeft", altKey: true }), b, "mac")).toBe(
      false
    );
  });

  it("default mask is exact match: kb(key, M.Shift) requires Shift, forbids others", () => {
    const b = kb(KeyCode.LeftArrow, M.Shift);
    // UNCHANGED behavior — exact Shift only.
    expect(
      match(mkEvent({ code: "ArrowLeft", shiftKey: true }), b, "mac")
    ).toBe(true);
    expect(match(mkEvent({ code: "ArrowLeft" }), b, "mac")).toBe(false);
    expect(
      match(
        mkEvent({ code: "ArrowLeft", shiftKey: true, altKey: true }),
        b,
        "mac"
      )
    ).toBe(false);
  });

  it("kb(key, M.Shift, M.Shift): only Shift is meaningful, others don't-care", () => {
    const b = kb(KeyCode.LeftArrow, M.Shift, M.Shift);
    // Shift required.
    expect(
      match(mkEvent({ code: "ArrowLeft", shiftKey: true }), b, "mac")
    ).toBe(true);
    // Other mods are don't-care: still fire when held.
    expect(
      match(
        mkEvent({ code: "ArrowLeft", shiftKey: true, altKey: true }),
        b,
        "mac"
      )
    ).toBe(true);
    expect(
      match(
        mkEvent({ code: "ArrowLeft", shiftKey: true, metaKey: true }),
        b,
        "mac"
      )
    ).toBe(true);
    expect(
      match(
        mkEvent({
          code: "ArrowLeft",
          shiftKey: true,
          altKey: true,
          metaKey: true,
          ctrlKey: true,
        }),
        b,
        "mac"
      )
    ).toBe(true);
    // But Shift is gated — without it, no match.
    expect(match(mkEvent({ code: "ArrowLeft" }), b, "mac")).toBe(false);
    expect(match(mkEvent({ code: "ArrowLeft", altKey: true }), b, "mac")).toBe(
      false
    );
  });

  it("kb(key, 0, M.Shift): Shift is meaningful and must be ABSENT, others don't-care", () => {
    const b = kb(KeyCode.LeftArrow, 0, M.Shift);
    expect(match(mkEvent({ code: "ArrowLeft" }), b, "mac")).toBe(true);
    expect(match(mkEvent({ code: "ArrowLeft", altKey: true }), b, "mac")).toBe(
      true
    );
    expect(match(mkEvent({ code: "ArrowLeft", metaKey: true }), b, "mac")).toBe(
      true
    );
    // Shift is in mask but not required → forbidden.
    expect(
      match(mkEvent({ code: "ArrowLeft", shiftKey: true }), b, "mac")
    ).toBe(false);
  });

  it("kb(key, 0, 0): empty mask = any modifier state matches", () => {
    const b = kb(KeyCode.LeftArrow, 0, 0);
    expect(match(mkEvent({ code: "ArrowLeft" }), b, "mac")).toBe(true);
    expect(
      match(mkEvent({ code: "ArrowLeft", shiftKey: true }), b, "mac")
    ).toBe(true);
    expect(match(mkEvent({ code: "ArrowLeft", altKey: true }), b, "mac")).toBe(
      true
    );
    expect(
      match(
        mkEvent({
          code: "ArrowLeft",
          shiftKey: true,
          altKey: true,
          metaKey: true,
          ctrlKey: true,
        }),
        b,
        "mac"
      )
    ).toBe(true);
  });

  it("CtrlCmd still resolves per-platform when mask is partial", () => {
    // Required CtrlCmd, only Shift is meaningful → Ctrl/Alt/Meta-besides-CtrlCmd don't-care.
    // On mac, CtrlCmd resolves to Meta. With meaningful=Shift, the other 3
    // real mods are don't-care; but CtrlCmd's resolved bit (Meta on mac)
    // is required, so Meta MUST be held.
    const b = kb(KeyCode.KeyZ, M.CtrlCmd, M.Shift);
    expect(match(mkEvent({ code: "KeyZ", metaKey: true }), b, "mac")).toBe(
      true
    );
    expect(
      match(mkEvent({ code: "KeyZ", metaKey: true, altKey: true }), b, "mac")
    ).toBe(true);
    // Shift is meaningful but not required → forbidden.
    expect(
      match(mkEvent({ code: "KeyZ", metaKey: true, shiftKey: true }), b, "mac")
    ).toBe(false);
  });
});
