import { describe, expect, it } from "vitest";
import {
  M,
  kb,
  keybindingsToKeyCodes,
  resolveChunk,
  resolveMods,
  resolveSequence,
} from "../src/keybinding";
import { KeyCode } from "../src/keycode";

describe("resolveMods", () => {
  it("resolves CtrlCmd to Meta on mac", () => {
    expect(resolveMods(M.CtrlCmd, "mac")).toEqual([KeyCode.Meta]);
  });

  it("resolves CtrlCmd to Ctrl on windows", () => {
    expect(resolveMods(M.CtrlCmd, "windows")).toEqual([KeyCode.Ctrl]);
  });

  it("resolves CtrlCmd to Ctrl on linux", () => {
    expect(resolveMods(M.CtrlCmd, "linux")).toEqual([KeyCode.Ctrl]);
  });

  it("does not duplicate Ctrl when CtrlCmd|Ctrl is set", () => {
    // CtrlCmd already implies Ctrl on non-mac; explicit Ctrl is suppressed.
    expect(resolveMods(M.CtrlCmd | M.Ctrl, "windows")).toEqual([KeyCode.Ctrl]);
  });

  it("preserves order: Ctrl, Shift, Alt, Meta", () => {
    expect(resolveMods(M.Ctrl | M.Shift | M.Alt | M.Meta, "linux")).toEqual([
      KeyCode.Ctrl,
      KeyCode.Shift,
      KeyCode.Alt,
      KeyCode.Meta,
    ]);
  });

  it("returns empty for no modifiers", () => {
    expect(resolveMods(0, "mac")).toEqual([]);
  });
});

describe("resolveChunk", () => {
  it("resolves chunk modifiers and preserves keys", () => {
    expect(resolveChunk([M.CtrlCmd, KeyCode.KeyZ], "mac")).toEqual({
      mods: [KeyCode.Meta],
      keys: [KeyCode.KeyZ],
    });
  });

  it("filters Unknown and DependsOnKbLayout from keys", () => {
    expect(
      resolveChunk(
        [M.Ctrl, KeyCode.KeyA, KeyCode.Unknown, KeyCode.DependsOnKbLayout],
        "linux"
      )
    ).toEqual({
      mods: [KeyCode.Ctrl],
      keys: [KeyCode.KeyA],
    });
  });
});

describe("resolveSequence", () => {
  it("resolves every chunk in a chord-sequence (resolvable, though not dispatched in V1)", () => {
    const resolved = resolveSequence(
      [
        [M.CtrlCmd, KeyCode.KeyK],
        [M.CtrlCmd, KeyCode.KeyS],
      ],
      "mac"
    );
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toEqual({
      mods: [KeyCode.Meta],
      keys: [KeyCode.KeyK],
    });
  });
});

describe("keybindingsToKeyCodes", () => {
  it("resolves a single kb() sequence", () => {
    const out = keybindingsToKeyCodes(kb(KeyCode.KeyZ, M.CtrlCmd), "mac");
    expect(out).toEqual([[{ mods: [KeyCode.Meta], keys: [KeyCode.KeyZ] }]]);
  });

  it("resolves a platform-specific binding by selecting the active platform", () => {
    const binding = {
      mac: kb(KeyCode.KeyZ, M.Meta),
      windows: kb(KeyCode.KeyZ, M.Ctrl),
    };
    const onMac = keybindingsToKeyCodes(binding, "mac");
    const onWin = keybindingsToKeyCodes(binding, "windows");
    expect(onMac).toEqual([[{ mods: [KeyCode.Meta], keys: [KeyCode.KeyZ] }]]);
    expect(onWin).toEqual([[{ mods: [KeyCode.Ctrl], keys: [KeyCode.KeyZ] }]]);
  });
});
