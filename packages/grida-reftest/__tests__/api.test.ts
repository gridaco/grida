// Exercise the programmatic API end-to-end.
//
// Covers both invocation shapes:
//   1. file-based: caller has actuals on disk, we diff them
//   2. callback-based: caller provides renderOne; we write to a temp dir
//      and feed the same file-based pipeline
//
// The second path is the critical invariant check: both shapes must
// produce byte-identical report.json output modulo the disk paths
// embedded in `output_png`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { reftest, compare } from "../src/index.js";
import { makeSolidPng, writeFixture } from "./fixtures.js";

let root: string;
let expectedDir: string;
let actualDir: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "grida-reftest-api-"));
  expectedDir = path.join(root, "expected");
  actualDir = path.join(root, "actual");
  fs.mkdirSync(expectedDir, { recursive: true });
  fs.mkdirSync(actualDir, { recursive: true });

  const red = makeSolidPng(8, 8, [255, 0, 0, 255]);
  const blue = makeSolidPng(8, 8, [0, 0, 255, 255]);
  // identical pair → S99
  writeFixture(expectedDir, "match.png", red);
  writeFixture(actualDir, "match.png", red);
  // different pair → S75. Oracle is blue; the file-based test's actual
  // is red (so the pair diffs 100%), and the callback test's callback
  // also returns red (same outcome, for both shapes the expected side
  // is the source of truth for the test set).
  writeFixture(expectedDir, "mismatch.png", blue);
  writeFixture(actualDir, "mismatch.png", red);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("reftest() — file-based", () => {
  it("runs a suite from actualDir + expectedDir and returns a report", async () => {
    const outputDir = path.join(root, "out-file");
    const report = await reftest({
      name: "api-file",
      expectedDir,
      actualDir,
      outputDir,
      diff: { threshold: 0 },
      scoring: { mask: "none" },
      bg: "white",
    });
    expect(report.total).toBe(2);
    const byName = Object.fromEntries(report.tests.map((t) => [t.testName, t]));
    expect(byName.match!.similarityScore).toBe(1);
    expect(byName.mismatch!.similarityScore).toBe(0);
    expect(fs.existsSync(path.join(outputDir, "report.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, "S99", "match.current.png"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, "S75", "mismatch.current.png"))
    ).toBe(true);
  });
});

describe("reftest() — callback path", () => {
  it("renderOne writes each actual to a scratch dir and then diffs", async () => {
    const outputDir = path.join(root, "out-cb");
    const seen: string[] = [];
    const report = await reftest({
      name: "api-cb",
      expectedDir,
      outputDir,
      diff: { threshold: 0 },
      scoring: { mask: "none" },
      bg: "white",
      renderOne: async (ctx) => {
        seen.push(ctx.name);
        // For "match", return identical red. For "mismatch", return red too —
        // the oracle expects red on match.png and blue on mismatch.png, so
        // this will score match=1.0, mismatch=0.0 (every pixel diffs).
        return makeSolidPng(
          ctx.expectedSize.width,
          ctx.expectedSize.height,
          [255, 0, 0, 255]
        );
      },
    });

    expect(seen.sort()).toEqual(["match", "mismatch"]);
    expect(report.total).toBe(2);
    const byName = Object.fromEntries(report.tests.map((t) => [t.testName, t]));
    expect(byName.match!.similarityScore).toBe(1);
    expect(byName.mismatch!.similarityScore).toBe(0);
    // The callback path must produce the same bucket layout as the file path.
    expect(
      fs.existsSync(path.join(outputDir, "S99", "match.current.png"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, "S75", "mismatch.current.png"))
    ).toBe(true);
  });

  it("refuses to run without actualDir or renderOne", async () => {
    await expect(
      // @ts-expect-error: intentionally invalid — missing both discriminants
      reftest({ name: "bad", expectedDir, outputDir: path.join(root, "nope") })
    ).rejects.toThrow(/actualDir or renderOne/);
  });
});

describe("compare()", () => {
  it("returns a CompareResult for an ad-hoc pair", async () => {
    const result = await compare({
      actual: path.join(actualDir, "match.png"),
      expected: path.join(expectedDir, "match.png"),
      threshold: 0,
      mask: "none",
    });
    expect(result.similarity).toBe(1);
    expect(result.diffPixels).toBe(0);
    expect(result.error).toBeNull();
  });
});
