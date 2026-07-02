/**
 * GRIDA-SEC-004 — read-only command categorization (the `accept-edits` gate).
 *
 * Pins the fail-safe contract: positively-classified inspectors pass; anything
 * else (unknown binary, mutating flag, mutating subcommand, dangerous git
 * flag) is NOT read-only, so it over-restricts (an approval) rather than
 * over-permits. A gap here costs a prompt, never a breach.
 */
import { describe, expect, it } from "vitest";
import { isReadOnlyCommand } from "./permissions";

describe("isReadOnlyCommand", () => {
  it("accepts pure inspectors", () => {
    for (const cmd of [
      "ls",
      "pwd",
      "echo",
      "cat",
      "head",
      "tail",
      "wc",
      "grep",
    ]) {
      expect(isReadOnlyCommand(cmd, [])).toBe(true);
    }
  });

  it("rejects interpreters, shells, and package managers (fail-safe unknown)", () => {
    for (const cmd of [
      "node",
      "python3",
      "python",
      "deno",
      "bun",
      "bash",
      "sh",
      "npm",
      "pnpm",
      "yarn",
      "make",
      "rm",
      "curl",
    ]) {
      expect(isReadOnlyCommand(cmd, [])).toBe(false);
    }
  });

  it("rejects the empty string and path-shaped names", () => {
    expect(isReadOnlyCommand("", [])).toBe(false);
    expect(isReadOnlyCommand("/bin/ls", [])).toBe(false);
    expect(isReadOnlyCommand("./ls", [])).toBe(false);
    expect(isReadOnlyCommand("..\\ls", [])).toBe(false);
  });

  it("treats find as read-only only without -exec/-delete/-fprint", () => {
    expect(isReadOnlyCommand("find", [".", "-name", "*.ts"])).toBe(true);
    expect(isReadOnlyCommand("find", [".", "-exec", "rm", "{}", ";"])).toBe(
      false
    );
    expect(isReadOnlyCommand("find", [".", "-delete"])).toBe(false);
    expect(isReadOnlyCommand("find", [".", "-execdir", "sh", "-c", "x"])).toBe(
      false
    );
  });

  it("treats rg as read-only only without process-spawning flags (--pre/--hostname-bin)", () => {
    expect(isReadOnlyCommand("rg", ["pattern", "."])).toBe(true);
    expect(isReadOnlyCommand("rg", [])).toBe(true);
    expect(isReadOnlyCommand("rg", ["--glob", "*.ts", "pattern"])).toBe(true);
    // --pre runs a command on every searched file → arbitrary exec.
    expect(isReadOnlyCommand("rg", ["--pre", "evil.sh", "pattern", "."])).toBe(
      false
    );
    expect(isReadOnlyCommand("rg", ["--pre=evil.sh", "pattern", "."])).toBe(
      false
    );
    expect(
      isReadOnlyCommand("rg", ["--hostname-bin", "evil.sh", "pattern"])
    ).toBe(false);
    expect(isReadOnlyCommand("rg", ["--hostname-bin=evil.sh", "pattern"])).toBe(
      false
    );
    // --pre-glob alone (no --pre) is harmless and must NOT be falsely flagged.
    expect(isReadOnlyCommand("rg", ["--pre-glob", "*.pdf", "pattern"])).toBe(
      true
    );
  });

  it("allows read-only git subcommands only", () => {
    for (const sub of [
      "status",
      "log",
      "diff",
      "show",
      "ls-files",
      "rev-parse",
      "blame",
    ]) {
      expect(isReadOnlyCommand("git", [sub])).toBe(true);
    }
    for (const sub of [
      "push",
      "commit",
      "checkout",
      "merge",
      "reset",
      "clone",
      "branch",
    ]) {
      expect(isReadOnlyCommand("git", [sub])).toBe(false);
    }
  });

  it("rejects git read-only subcommands carrying arbitrary-exec/read flags", () => {
    expect(
      isReadOnlyCommand("git", ["-c", "core.pager=sh -c evil", "log"])
    ).toBe(false);
    expect(isReadOnlyCommand("git", ["--git-dir=/etc", "status"])).toBe(false);
    expect(isReadOnlyCommand("git", ["--upload-pack=evil", "ls-files"])).toBe(
      false
    );
    expect(isReadOnlyCommand("git", ["--exec-path=/tmp", "diff"])).toBe(false);
  });
});
