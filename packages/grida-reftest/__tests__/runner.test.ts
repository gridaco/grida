import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runSuite } from "../src/runner.js";
import { deserializeReport } from "../src/report.js";
import { makeSolidPng, writeFixture } from "./fixtures.js";

let root: string;
let actualDir: string;
let expectedDir: string;
let outputDir: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "grida-reftest-runner-"));
  actualDir = path.join(root, "actuals");
  expectedDir = path.join(root, "expecteds");
  outputDir = path.join(root, "out");
  fs.mkdirSync(actualDir, { recursive: true });
  fs.mkdirSync(expectedDir, { recursive: true });

  const red = makeSolidPng(8, 8, [255, 0, 0, 255]);
  const blue = makeSolidPng(8, 8, [0, 0, 255, 255]);

  // s99: identical
  writeFixture(actualDir, "identical.png", red);
  writeFixture(expectedDir, "identical.png", red);
  // s75: totally different
  writeFixture(actualDir, "different.png", red);
  writeFixture(expectedDir, "different.png", blue);
  // err: missing expected
  writeFixture(actualDir, "missing.png", red);
  // err: dimension mismatch
  writeFixture(actualDir, "size.png", red);
  writeFixture(expectedDir, "size.png", makeSolidPng(16, 16, [255, 0, 0, 255]));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("runSuite", () => {
  it("buckets test pairs and writes a report.json", async () => {
    const report = await runSuite({
      name: "smoke",
      actualDir,
      expectedDir,
      outputDir,
      threshold: 0,
    });

    expect(report.total).toBe(4);
    expect(report.tests.length).toBe(4);

    const byName = Object.fromEntries(report.tests.map((t) => [t.testName, t]));
    expect(byName.identical!.similarityScore).toBe(1);
    expect(byName.identical!.error).toBeNull();
    expect(byName.different!.similarityScore).toBe(0);
    expect(byName.missing!.error).toMatch(/no expected/);
    expect(byName.size!.error).toMatch(/Dimension mismatch/i);

    // Output layout on disk.
    expect(
      fs.existsSync(path.join(outputDir, "S99", "identical.current.png"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, "S99", "identical.expected.png"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, "S99", "identical.diff.png"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, "S75", "different.current.png"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, "err", "missing.current.png"))
    ).toBe(true);

    // report.json is readable and round-trips through the snake_case wire form.
    const reportPath = path.join(outputDir, "report.json");
    const raw = fs.readFileSync(reportPath, "utf8");
    expect(raw).toContain("similarity_score"); // snake_case on disk
    const parsed = deserializeReport(raw);
    expect(parsed.total).toBe(4);
    // Similarity stats are over non-error rows only.
    const valid = parsed.tests.filter((t) => t.error === null);
    expect(valid.length).toBe(2);
  });

  it("honors --overwrite=false by throwing if output exists", async () => {
    const outDir = path.join(root, "out-nowipe");
    fs.mkdirSync(outDir, { recursive: true });
    await expect(
      runSuite({
        name: "x",
        actualDir,
        expectedDir,
        outputDir: outDir,
        overwrite: false,
      })
    ).rejects.toThrow(/already exists/);
  });

  it("filter narrows the test set", async () => {
    const outDir = path.join(root, "out-filter");
    const report = await runSuite({
      name: "filter",
      actualDir,
      expectedDir,
      outputDir: outDir,
      filter: "identical",
    });
    expect(report.total).toBe(1);
    expect(report.tests[0]!.testName).toBe("identical");
  });
});
