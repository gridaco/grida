import { describe, expect, it } from "vitest";
import { c, kb, seq, platformKb, M } from "../src/keybinding";
import { KeyCode } from "../src/keycode";

describe("builders", () => {
  it("kb() returns a single-chunk sequence", () => {
    const binding = kb(KeyCode.KeyZ, M.CtrlCmd);
    expect(binding).toEqual([[M.CtrlCmd, KeyCode.KeyZ]]);
    expect(binding.length).toBe(1);
  });

  it("kb() defaults mods to 0 (no modifiers)", () => {
    expect(kb(KeyCode.Escape)).toEqual([[0, KeyCode.Escape]]);
  });

  it("c() builds a single chunk", () => {
    expect(c(M.Ctrl | M.Shift, KeyCode.KeyA)).toEqual([
      M.Ctrl | M.Shift,
      KeyCode.KeyA,
    ]);
  });

  it("seq() composes multiple chunks (chord)", () => {
    const chord = seq(c(M.CtrlCmd, KeyCode.KeyK), c(M.CtrlCmd, KeyCode.KeyS));
    expect(chord).toHaveLength(2);
    expect(chord[0]).toEqual([M.CtrlCmd, KeyCode.KeyK]);
    expect(chord[1]).toEqual([M.CtrlCmd, KeyCode.KeyS]);
  });

  it("platformKb() preserves per-platform mapping", () => {
    const binding = platformKb({
      mac: kb(KeyCode.KeyZ, M.Meta),
      windows: kb(KeyCode.KeyZ, M.Ctrl),
    });
    expect(binding).toEqual({
      mac: [[M.Meta, KeyCode.KeyZ]],
      windows: [[M.Ctrl, KeyCode.KeyZ]],
    });
  });
});
