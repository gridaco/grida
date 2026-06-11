import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clampGridSize,
  isValidTerminalId,
  resolveDefaultShell,
  TerminalRegistry,
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

/**
 * The reservation protocol — regression coverage for the TOCTOU where
 * concurrent `terminal.create` calls passed the duplicate/cap checks
 * together before any of them reached the async spawn, and for
 * exit-vs-recycled-id teardown.
 */
describe("TerminalRegistry", () => {
  const owner = { id: 1 };
  const other = { id: 2 };

  it("a pending reservation already claims the id (concurrent create race)", () => {
    const reg = new TerminalRegistry<object, string>(8);
    reg.reserve("a", owner);
    // second create for the same id arrives before the first spawn lands
    expect(() => reg.reserve("a", owner)).toThrow(/already exists/);
  });

  it("pending reservations count against the per-owner cap", () => {
    const reg = new TerminalRegistry<object, string>(2);
    reg.reserve("a", owner);
    reg.reserve("b", owner); // neither committed yet
    expect(() => reg.reserve("c", owner)).toThrow(/too many terminals/);
    // a different window is unaffected
    reg.reserve("c", other);
  });

  it("commit fails after a mid-spawn kill, so the caller destroys the PTY", () => {
    const reg = new TerminalRegistry<object, string>(8);
    reg.reserve("a", owner);
    expect(reg.take("a", owner)).toBeNull(); // kill during spawn: nothing live yet
    expect(reg.commit("a", owner, "pty-1")).toBe(false);
    expect(() => reg.get("a", owner)).toThrow(/not found/);
  });

  it("commit fails after a mid-spawn window close (takeAllFor)", () => {
    const reg = new TerminalRegistry<object, string>(8);
    reg.reserve("a", owner);
    reg.reserve("b", owner);
    expect(reg.commit("b", owner, "pty-b")).toBe(true);
    expect(reg.takeAllFor(owner)).toEqual(["pty-b"]); // only live PTYs returned
    expect(reg.commit("a", owner, "pty-a")).toBe(false);
  });

  it("a stale exit cannot tear down a recycled id", () => {
    const reg = new TerminalRegistry<object, string>(8);
    reg.reserve("a", owner);
    reg.commit("a", owner, "pty-1");
    reg.take("a", owner); // killed
    reg.reserve("a", owner); // id recycled by a fresh create
    reg.commit("a", owner, "pty-2");
    expect(reg.releaseExited("a", "pty-1")).toBe(false); // old PTY's exit: no-op
    expect(reg.get("a", owner)).toBe("pty-2");
    expect(reg.releaseExited("a", "pty-2")).toBe(true);
  });

  it("ownership: another window can neither get nor take, and pending is not gettable", () => {
    const reg = new TerminalRegistry<object, string>(8);
    reg.reserve("a", owner);
    expect(() => reg.get("a", owner)).toThrow(/not found/); // pending
    reg.commit("a", owner, "pty-1");
    expect(() => reg.get("a", other)).toThrow(/not found/);
    expect(() => reg.take("a", other)).toThrow(/not found/);
    expect(reg.take("bogus", owner)).toBeNull(); // idempotent kill
    expect(reg.take("a", owner)).toBe("pty-1");
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
