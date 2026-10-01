import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { verifyBuild, baselinePath } from "./baseline.mjs";
import { buildRust, runCase, validateCases } from "./cli.mjs";
import {
  coverage,
  targetIncomplete,
  assertOperationVectors,
} from "./inventory.mjs";
import { checks, runCheck } from "./checks.mjs";

const { values } = parseArgs({
  options: {
    implementation: { type: "string", default: "both" },
    suite: { type: "string", default: "completed" },
    list: { type: "boolean", default: false },
  },
});
assert(["ts", "rust", "both"].includes(values.implementation));
assert(["completed", "target"].includes(values.suite));
const cases = validateCases(
  JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8"))
);
const inventory = JSON.parse(
  await readFile(new URL("./inventory.json", import.meta.url), "utf8")
);
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
assert.equal(
  inventory.baseline_revision,
  baseline.revision,
  "Inventory and reference revisions differ"
);
const remaining = coverage(inventory, cases, checks);
const fixture = (name) =>
  new URL(`../../crates/grida-ai/tests/fixtures/${name}`, import.meta.url);
assertOperationVectors(
  inventory,
  JSON.parse(await readFile(fixture("media-wire-vectors.json"), "utf8")),
  (await readFile(fixture("input-vectors.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse),
  (await readFile(fixture("error-vectors.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse)
);
const pending = remaining.pending;
// Completing examples does not complete a contract group. A reviewed inventory
// explicitly records which groups still need scenarios before the cutover gate.
const incomplete = remaining.groups;
console.log(
  `Inventory: ${cases.length} executable cases; Rust ${cases.length - pending.length} completed, ${pending.length} pending; ${incomplete.length} contract groups, ${remaining.operations.length} operations and ${remaining.decisions.length} decisions still incomplete.`
);
if (values.list) {
  for (const test of cases) console.log(`${test.rust.padEnd(8)} ${test.id}`);
  for (const check of checks)
    console.log(`${check.rust.padEnd(8)} ${check.id}: ${check.description}`);
  for (const group of incomplete)
    console.log(`uncovered ${group.id}: ${group.description}`);
  for (const operation of remaining.operations)
    console.log(`uncovered ${operation.id}`);
} else {
  await verifyBuild();
  // Use the exact executable paths Cargo reports, including custom target dirs.
  // A stale target/debug binary must never certify edited source.
  const binaries = values.implementation === "ts" ? undefined : buildRust();
  let passed = 0,
    failed = 0;
  for (const implementation of values.implementation === "both"
    ? ["ts", "rust"]
    : [values.implementation]) {
    const selected =
      implementation === "ts" || values.suite === "target"
        ? cases
        : cases.filter((test) => test.rust === "complete");
    for (const test of selected) {
      try {
        await runCase(implementation, test, binaries);
        passed++;
      } catch (error) {
        failed++;
        console.error(`FAIL ${implementation} ${test.id}: ${error.message}`);
      }
    }
    console.log(`${implementation}: executed ${selected.length} cases`);
  }
  if (values.implementation !== "ts") {
    for (const check of checks) {
      if (values.suite !== "target" && check.rust !== "complete") continue;
      try {
        console.log(`CHECK ${check.id}: ${check.description}`);
        runCheck(check);
        passed++;
      } catch (error) {
        failed++;
        console.error(`FAIL ${check.id}: ${error.message}`);
      }
    }
  }
  console.log(
    `Results: ${passed} passed, ${failed} failed. Pending inventory is not parity.`
  );
  if (
    failed ||
    (values.suite === "target" &&
      values.implementation !== "ts" &&
      targetIncomplete(remaining))
  )
    process.exitCode = 1;
}
