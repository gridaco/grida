// GRIDA-SEC-004 / GRIDA-SEC-006 — failed cleanup retains safe evidence and cannot pass.
// GRIDA-GG: provider — cleanup tests use no provider or gateway authority.
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { finishReport } from "./proof.mjs";

test("AI proof removes owned files before writing its successful report", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "grida-ai-report-"));
  const owned = path.join(root, "owned");
  const filename = path.join(root, "result.json");
  try {
    await mkdir(owned);
    await writeFile(path.join(owned, "fixture"), "synthetic");
    const report = { passed: true, phase: "complete" };
    await finishReport(owned, filename, report);
    assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), {
      passed: true,
      phase: "complete",
      cleaned: true,
    });
    await assert.rejects(readFile(path.join(owned, "fixture")), {
      code: "ENOENT",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const originalFailure of [false, true]) {
  test(`cleanup failure writes a failed report and preserves ${originalFailure ? "the original error" : "a nonzero outcome"}`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "grida-ai-report-"));
    const owned = path.join(root, "owned");
    const filename = path.join(root, "result.json");
    try {
      await mkdir(owned);
      const report = {
        passed: !originalFailure,
        phase: originalFailure ? "public cjs consumer" : "complete",
      };
      const failure = originalFailure
        ? Object.assign(new Error("synthetic original failure"), {
            proofPhase: report.phase,
          })
        : undefined;
      t.mock.method(fs.promises, "rm", async () => {
        throw new Error("synthetic cleanup failure");
      });
      syncBuiltinESMExports();
      await assert.rejects(
        finishReport(owned, filename, report, failure),
        (error) => {
          if (failure) assert.equal(error, failure);
          else assert.equal(error.message, "AI proof cleanup failed");
          assert.equal(error.proofPhase, report.phase);
          return true;
        }
      );
      assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), {
        passed: false,
        phase: report.phase,
        cleaned: false,
      });
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
      await rm(root, { recursive: true, force: true });
    }
  });
}
