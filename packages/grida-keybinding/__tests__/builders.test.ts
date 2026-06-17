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

  it("seq() composes heterogeneous chunks into a chord-sequence (Ctrl+K Ctrl+C)", () => {
    const sequence = seq(
      c(M.CtrlCmd, KeyCode.KeyK),
      c(M.CtrlCmd, KeyCode.KeyC)
    );
    expect(sequence).toHaveLength(2);
    expect(sequence[0]).toEqual([M.CtrlCmd, KeyCode.KeyK]);
    expect(sequence[1]).toEqual([M.CtrlCmd, KeyCode.KeyC]);
  });

  it("seq() of a repeated chunk is a structural chord-sequence with no tap/timing metadata", () => {
    // `0 0` is a multi-TAP gesture (clock-disambiguated), NOT a chord-sequence.
    // seq() does not (and cannot) model that — it just returns the two chunks
    // verbatim. Pins that the vocabulary carries no tap concept: a repeated
    // chunk is structurally indistinct from any other 2-chunk sequence.
    const repeated = seq(c(0, KeyCode.Digit0), c(0, KeyCode.Digit0));
    expect(repeated).toEqual([
      [0, KeyCode.Digit0],
      [0, KeyCode.Digit0],
    ]);
    expect(repeated).toHaveLength(2);
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
