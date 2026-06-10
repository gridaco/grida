import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clampGridSize,
  isValidTerminalId,
  resolveDefaultShell,
} from "./terminal-host";

describe("resolveDefaultShell", () => {
  it("uses $SHELL as a login shell on macOS", () => {
    expect(resolveDefaultShell("darwin", { SHELL: "/opt/fish" })).toEqual({
      command: "/opt/fish",
      args: ["-l"],
    });
    expect(resolveDefaultShell("darwin", {})).toEqual({
      command: "/bin/zsh",
      args: ["-l"],
    });
  });

  it("uses $SHELL as-is on linux", () => {
    expect(resolveDefaultShell("linux", { SHELL: "/usr/bin/zsh" })).toEqual({
      command: "/usr/bin/zsh",
      args: [],
    });
    expect(resolveDefaultShell("linux", {})).toEqual({
      command: "/bin/bash",
      args: [],
    });
  });

  it("defaults to powershell on windows", () => {
    expect(resolveDefaultShell("win32", { SHELL: "/bin/bash" })).toEqual({
      command: "powershell.exe",
      args: [],
    });
  });
});

describe("clampGridSize", () => {
  it("floors and clamps to [1, 1000]", () => {
    expect(clampGridSize(80.7, 24)).toBe(80);
    expect(clampGridSize(0, 24)).toBe(1);
    expect(clampGridSize(-3, 24)).toBe(1);
    expect(clampGridSize(99999, 24)).toBe(1000);
  });

  it("falls back on non-numeric input", () => {
    expect(clampGridSize("80", 24)).toBe(24);
    expect(clampGridSize(NaN, 24)).toBe(24);
    expect(clampGridSize(undefined, 80)).toBe(80);
  });
});

describe("isValidTerminalId", () => {
  it("accepts UUID-shaped tokens and rejects everything else", () => {
    expect(isValidTerminalId("0b8d7c2e-91c4-4b6e-a9f4-2f6a4a9d1c0e")).toBe(
      true
    );
    expect(isValidTerminalId("")).toBe(false);
    expect(isValidTerminalId("a".repeat(65))).toBe(false);
    expect(isValidTerminalId("../etc/passwd")).toBe(false);
    expect(isValidTerminalId(42)).toBe(false);
  });
});

// GRIDA-SEC-004 anti-drift: every terminal IPC channel must be
// registered through `guarded(` — the sender-frame gate that keeps the
// RCE-by-design surface reachable only from editor-origin `/desktop/*`
// frames. A bare `ipcMain.handle(IPC_CHANNELS.TERMINAL_...` ships the
// surface without the gate.
describe("terminal IPC registration", () => {
  it("registers every terminal invoke channel via guarded()", () => {
    const source = fs.readFileSync(
      new URL("./ipc-handlers.ts", import.meta.url),
      "utf8"
    );
    for (const channel of [
      "TERMINAL_CREATE",
      "TERMINAL_WRITE",
      "TERMINAL_RESIZE",
      "TERMINAL_KILL",
    ]) {
      expect(source).toMatch(
        new RegExp(`guarded\\(\\s*IPC_CHANNELS.${channel}`)
      );
      expect(source).not.toMatch(
        new RegExp(`ipcMain.handle\\(\\s*IPC_CHANNELS.${channel}`)
      );
    }
  });
});
