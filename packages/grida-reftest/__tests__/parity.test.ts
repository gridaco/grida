// Parity gate: a single fixture pair must score within ±0.005 of the
// Rust `grida-dev reftest` tool (and land in the same bucket).
//
// Strategy
// --------
// 1. Copy the committed parity fixture (svg/halfdiff.svg + png/halfdiff.png)
//    into a scratch suite-dir that grida-dev reftest can consume.
// 2. Invoke the pre-built `target/debug/grida-dev` binary with the same
//    defaults this package uses under the hood (bg=white, threshold=0, no AA).
//    We keep mask=none to match Rust's default for non-SVG-kind configs.
// 3. Read the Rust-produced `report.json` and the bucketed `*.current.png`.
// 4. Run `@grida/reftest` on the same `current.png` + `expected.png` pair
//    with identical options (bg=white, mask=none, threshold=0, aa=false).
// 5. Assert `Math.abs(tsScore - rustScore) < 0.005` AND same bucket.
//
// The fixture is deliberately chosen to avoid anti-aliasing drift: a
// 16x16 solid-red SVG rendered to a 16x16 half-red/half-blue expected.
// Both scoring engines produce exactly 128 / 256 diff pixels here, so
// parity is mathematically guaranteed rather than just "close enough".
// A trivial identical pair is also tested as a boundary case.
//
// Skips (does not fail) when the Rust binary isn't available — CI without
// a cargo build has no way to run this. Devs who run `cargo build -p
// grida-dev` will see it enforced locally.

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { compareFiles } from "../src/compare.js";
import { bucketForScore } from "../src/score.js";
import { deserializeReport } from "../src/report.js";
import { makeSolidPng, writeFixture } from "./fixtures.js";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const RUST_BIN = path.join(REPO_ROOT, "target", "debug", "grida-dev");
const FIXTURES = path.resolve(__dirname, "fixtures", "parity");
const SVG_DIR = path.join(FIXTURES, "svg");
const PNG_DIR = path.join(FIXTURES, "png");

const PARITY_TOLERANCE = 0.005;

function rustBinAvailable(): boolean {
  try {
    fs.accessSync(RUST_BIN, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

interface RustRunResult {
  score: number;
  bucket: string;
  currentPng: string;
  expectedPng: string;
}

function runRustReftest(testName: string): RustRunResult {
  // grida-dev reftest requires a suite-dir with svg/ and png/ subdirs and
  // writes the bucketed output + report.json to --output-dir. We isolate
  // a single fixture by copying just the one pair into a scratch dir.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grida-reftest-parity-"));
  const suiteDir = path.join(tmp, "suite");
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(path.join(suiteDir, "svg"), { recursive: true });
  fs.mkdirSync(path.join(suiteDir, "png"), { recursive: true });
  fs.copyFileSync(
    path.join(SVG_DIR, `${testName}.svg`),
    path.join(suiteDir, "svg", `${testName}.svg`)
  );
  fs.copyFileSync(
    path.join(PNG_DIR, `${testName}.png`),
    path.join(suiteDir, "png", `${testName}.png`)
  );

  execFileSync(
    RUST_BIN,
    [
      "reftest",
      "--suite-dir",
      suiteDir,
      "--output-dir",
      outDir,
      "--bg",
      "white",
    ],
    { stdio: "pipe" }
  );

  const report = deserializeReport(
    fs.readFileSync(path.join(outDir, "report.json"), "utf8")
  );
  expect(report.total).toBe(1);
  const row = report.tests[0]!;
  expect(row.error).toBeNull();

  // The bucket is embedded in the output path: <outDir>/<bucket>/<name>.current.png
  const currentPng = row.outputPng;
  const bucket = path.basename(path.dirname(currentPng));
  const expectedPng = path.join(
    path.dirname(currentPng),
    `${testName}.expected.png`
  );

  return {
    score: row.similarityScore,
    bucket,
    currentPng,
    expectedPng,
  };
}

describe.runIf(rustBinAvailable())("parity with grida-dev reftest", () => {
  it("halfdiff fixture: TS score within ±0.005 of Rust score, same bucket", async () => {
    const rust = runRustReftest("halfdiff");

    const ts = await compareFiles(rust.currentPng, rust.expectedPng, {
      threshold: 0,
      aa: false,
      bg: "white",
      // Rust default for non-SVG kinds is `ScoringMask::None`. The fixture
      // doesn't ship a reftest.toml, so that's what the Rust side used.
      mask: "none",
    });

    const delta = Math.abs(ts.similarity - rust.score);
    expect(delta).toBeLessThan(PARITY_TOLERANCE);
    expect(bucketForScore(ts.similarity)).toBe(rust.bucket);

    // Belt-and-suspenders: both tools compute an exact 128/256 diff on
    // this fixture because there is no anti-aliasing to disagree about.
    expect(ts.similarity).toBeCloseTo(0.5, 5);
    expect(rust.score).toBeCloseTo(0.5, 5);
  });

  it("identical pair: both tools score exactly 1.0", async () => {
    // Build a one-off identical pair in a scratch dir: SVG of a solid
    // red 16x16 + an identical 16x16 red PNG. Both tools must report
    // similarity 1.0 and bucket S99.
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), "grida-reftest-parity-identical-")
    );
    const suiteDir = path.join(tmp, "suite");
    const outDir = path.join(tmp, "out");
    fs.mkdirSync(path.join(suiteDir, "svg"), { recursive: true });
    fs.mkdirSync(path.join(suiteDir, "png"), { recursive: true });
    fs.writeFileSync(
      path.join(suiteDir, "svg", "identical.svg"),
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">\n  <rect width="16" height="16" fill="#ff0000"/>\n</svg>\n`
    );
    writeFixture(
      path.join(suiteDir, "png"),
      "identical.png",
      makeSolidPng(16, 16, [255, 0, 0, 255])
    );

    execFileSync(
      RUST_BIN,
      [
        "reftest",
        "--suite-dir",
        suiteDir,
        "--output-dir",
        outDir,
        "--bg",
        "white",
      ],
      { stdio: "pipe" }
    );

    const rustReport = deserializeReport(
      fs.readFileSync(path.join(outDir, "report.json"), "utf8")
    );
    const row = rustReport.tests[0]!;
    expect(row.similarityScore).toBe(1);

    const currentPng = row.outputPng;
    const expectedPng = path.join(
      path.dirname(currentPng),
      "identical.expected.png"
    );
    const bucket = path.basename(path.dirname(currentPng));
    expect(bucket).toBe("S99");

    const ts = await compareFiles(currentPng, expectedPng, {
      threshold: 0,
      aa: false,
      bg: "white",
      mask: "none",
    });
    expect(ts.similarity).toBe(1);
    expect(bucketForScore(ts.similarity)).toBe("S99");
    expect(Math.abs(ts.similarity - row.similarityScore)).toBeLessThan(
      PARITY_TOLERANCE
    );
  });
});

describe.skipIf(rustBinAvailable())(
  "parity with grida-dev reftest (SKIPPED)",
  () => {
    it.todo(
      `rust binary not found at ${RUST_BIN}; run 'cargo build -p grida-dev' to enable`
    );
  }
);
