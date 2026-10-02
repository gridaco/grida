import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { buildRust, runCase, validateCases } from "./cli.mjs";
import { checks, runCheck } from "./checks.mjs";

const { values } = parseArgs({
  options: {
    "cli-only": { type: "boolean", default: false },
    list: { type: "boolean", default: false },
  },
});
const cases = validateCases(
  JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8"))
);
const selectedChecks = values["cli-only"] ? [] : checks;
if (values.list) {
  for (const test of cases) console.log(test.id);
  for (const check of selectedChecks)
    console.log(`${check.id}: ${check.description}`);
} else {
  // Cargo reports the actual executables, including custom target directories.
  const binaries = buildRust();
  let passed = 0,
    failed = 0;
  for (const test of cases) {
    try {
      await runCase(test, binaries);
      passed++;
    } catch (error) {
      failed++;
      console.error(`FAIL ${test.id}: ${error.message}`);
    }
  }
  console.log(`CLI: executed ${cases.length} contract cases`);
  for (const check of selectedChecks) {
    try {
      console.log(`CHECK ${check.id}: ${check.description}`);
      runCheck(check);
      passed++;
    } catch (error) {
      failed++;
      console.error(`FAIL ${check.id}: ${error.message}`);
    }
  }
  console.log(
    `Results: ${passed} passed, ${failed} failed.${values["cli-only"] ? " CLI-only; integration checks were not requested." : ""}`
  );
  if (failed) process.exitCode = 1;
}
