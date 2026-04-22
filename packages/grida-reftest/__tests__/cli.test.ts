import { describe, expect, it, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { makeSolidPng } from "./fixtures";

// Regression test for a Commander v12 option-collision quirk. The root
// program declares --threshold / --json / --aa / --bg / --mask (for the
// suite runner), and the `compare` subcommand declares the same long names
// with its own defaults. When long option names collide, CLI values bind to
// the root's option store and the subcommand's action otherwise receives
// only its defaults. The CLI works around this by reading optsWithGlobals()
// inside the compare action. These tests spawn the built CLI to verify the
// flag wiring end-to-end.

const CLI = path.resolve(__dirname, "../dist/cli.js");

function runCLI(args: string[]): {
  stdout: string;
  stderr: string;
  code: number | null;
} {
  const res = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { stdout: res.stdout, stderr: res.stderr, code: res.status };
}

describe("reftest CLI — compare subcommand", () => {
  let aPath: string;
  let bPath: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI)) {
      throw new Error(
        `Built CLI not found at ${CLI}. Run \`pnpm --filter @grida/reftest build\` first.`
      );
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reftest-cli-"));
    aPath = path.join(dir, "a.png");
    bPath = path.join(dir, "b.png");
    // Slight grayscale difference: 100 vs 120. With pixelmatch YIQ default
    // threshold 0.1 this is below the per-pixel threshold → 0 diff pixels.
    // With threshold 0 every pixel counts → 100% diff.
    fs.writeFileSync(aPath, makeSolidPng(10, 10, [100, 100, 100, 255]));
    fs.writeFileSync(bPath, makeSolidPng(10, 10, [120, 120, 120, 255]));
  });

  it("honours --threshold 0 (CLI value overrides subcommand default)", () => {
    const { stdout, code } = runCLI([
      "compare",
      aPath,
      bPath,
      "--threshold",
      "0",
      "--json",
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.diff_pixels).toBe(100);
    expect(parsed.diff_percentage).toBe(100);
    expect(code).toBe(1);
  });

  it("uses default threshold 0.1 when flag is omitted", () => {
    const { stdout, code } = runCLI(["compare", aPath, bPath, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.diff_pixels).toBe(0);
    expect(code).toBe(0);
  });

  it("emits JSON when --json flag is set", () => {
    const { stdout } = runCLI(["compare", aPath, bPath, "--json"]);
    expect(() => JSON.parse(stdout)).not.toThrow();
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("similarity");
    expect(parsed).toHaveProperty("diff_pixels");
    expect(parsed).toHaveProperty("total_pixels");
  });

  it("emits plain-text output when --json is omitted", () => {
    const { stdout } = runCLI(["compare", aPath, bPath]);
    expect(stdout).toMatch(/similarity=\d/);
    expect(() => JSON.parse(stdout)).toThrow(SyntaxError);
  });

  it("accepts -t short form for --threshold", () => {
    const { stdout } = runCLI(["compare", aPath, bPath, "-t", "0", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.diff_pixels).toBe(100);
  });
});
