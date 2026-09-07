// GRIDA-SEC-010 — safe structured failures and escaped human-readable metadata.
import { describe, expect, it } from "vitest";
import { Output } from "./output";

describe("CLI output", () => {
  it("renders integer USD cents without floating-point rounding", () => {
    expect(Output.usd(0)).toBe("0.00 USD");
    expect(Output.usd(-1)).toBe("-0.01 USD");
    expect(Output.usd(123)).toBe("1.23 USD");
    expect(Output.usd(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91 USD");
  });
  it("preserves JSON facts including negative, zero and unknown balances", () => {
    for (const balance_cents of [null, 0, -123]) {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const output = new Output(
        true,
        (value) => stdout.push(value),
        (value) => stderr.push(value)
      );
      output.result({ balance_cents }, ["ignored"]);
      expect(stdout).toEqual([JSON.stringify({ balance_cents }) + "\n"]);
      expect(stderr).toEqual([]);
    }
  });

  it("escapes account-controlled terminal controls while retaining JSON strings", () => {
    const name = "studio\x1b]52;c;clipboard\x07\nforged line\u202E";
    const stdout: string[] = [];
    const stderr: string[] = [];
    const output = new Output(
      false,
      (value) => stdout.push(value),
      (value) => stderr.push(value)
    );
    output.result({ name }, [name]);
    output.failure({
      code: "organization_required",
      message: "Select an organization.",
      choices: [{ id: 1, name, display_name: name }],
      choices_truncated: true,
    });
    for (const control of ["\x1b", "\x07", "\u202e"])
      expect(stdout[0]).not.toContain(control);
    expect(stdout[0]?.split("\n")).toHaveLength(2);
    for (const control of ["\x1b", "\x07", "\u202e"])
      expect(stderr.join("")).not.toContain(control);
    expect(stderr.join("")).toContain("grida account view");
  });

  it("writes one structured failure to stdout and human failures to stderr", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const error = { code: "signed_out", message: "Run grida auth login." };
    new Output(
      true,
      (value) => stdout.push(value),
      (value) => stderr.push(value)
    ).failure(error);
    expect(stdout).toEqual([JSON.stringify({ error }) + "\n"]);
    expect(stderr).toEqual([]);
    stdout.length = 0;
    new Output(
      false,
      (value) => stdout.push(value),
      (value) => stderr.push(value)
    ).failure(error);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["grida: Run grida auth login. (signed_out)\n"]);
  });
});
