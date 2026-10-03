import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const groups = ["rust", "conformance", "native", "docs", "tooling"];
const all = () => Object.fromEntries(groups.map((group) => [group, true]));

// Keep these rules with the input inventory in ci-changes.md. A pnpm change
// affects JS consumers conservatively; native delivery never installs that graph.
const cargo =
  /^(Cargo\.(toml|lock)|rust-toolchain\.toml|\.cargo\/.*|crates\/.*)$/;
const sdk = /^packages\/grida-(ai|ai-models|auth|account|home)\//;
const rustFixtures =
  /^(packages\/grida-auth\/fixtures\/|fixtures\/images\/checker\.png$)/;
const packaging =
  /^(packages\/grida-cli\/|scripts\/cli-release\/|scripts\/npm(?:\.test)?\.mjs$|scripts\/cli-contracts\/installed\.mjs$|LICENSE$|\.gitattributes$|\.nvmrc$)/;
const documentation =
  /^(docs\/|apps\/docs\/|scripts\/cli-docs\/|editor\/next\.config\.ts$)/;
const jsConfig =
  /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$/;
const publication =
  /^(scripts\/publish-packages(?:\.test)?\.mjs|\.changeset\/config\.json)$/;

export function classify(paths) {
  const selected = Object.fromEntries(groups.map((group) => [group, false]));
  for (const file of paths) {
    if (
      typeof file !== "string" ||
      !file ||
      file.startsWith("/") ||
      file.split("/").some((part) => part === ".." || part === ".") ||
      file.includes("\0")
    )
      return all();

    // Changes to the selector or workflow wiring must exercise every branch.
    if (/^\.github\/(workflows\/|scripts\/ci-changes[.])/.test(file))
      return all();

    let known = false;
    const select = (...names) => {
      known = true;
      for (const name of names) selected[name] = true;
    };
    if (cargo.test(file)) select("rust", "conformance", "native", "docs");
    if (rustFixtures.test(file)) select("rust", "conformance", "docs");
    if (packaging.test(file))
      select("conformance", "native", "docs", "tooling");
    if (sdk.test(file) || file.startsWith("data/ai/")) select("conformance");
    if (documentation.test(file)) select("conformance", "docs");
    if (file.startsWith("scripts/cli-contracts/")) select("conformance");
    if (jsConfig.test(file)) select("conformance", "docs", "tooling");
    if (file === "turbo.json" || file === ".oxfmtrc.jsonc")
      select("conformance");
    if (publication.test(file)) select("tooling");
    if (known) continue;

    // These products do not feed the jobs above. Specific consumed files must
    // match first. The tests guard the SDK workspace closure and CLI isolation.
    if (
      /^(editor|apps|packages|desktop|database|public|services|jobs|supabase|branding|test|\.agents|\.changeset)\//.test(
        file
      )
    )
      continue;
    if (/^\.github\/(ISSUE_TEMPLATE|release-notes)\//.test(file)) continue;
    if (/^[^/]+\.md$/.test(file)) continue;

    // New root configuration, fixtures or tooling need an owner before skipping.
    return all();
  }
  return selected;
}

export function changedPaths(eventName, event, cwd) {
  let base, head, separator;
  if (eventName === "pull_request") {
    base = event.pull_request?.base?.sha;
    head = event.pull_request?.head?.sha;
    separator = "...";
  } else if (eventName === "push") {
    base = event.before;
    head = event.after;
    separator = "..";
  } else {
    throw new Error(`No change comparison for ${eventName}`);
  }
  for (const sha of [base, head]) {
    assert(
      /^[a-f0-9]{40,64}$/.test(sha) && !/^0+$/.test(sha),
      "Missing comparison commit"
    );
  }
  // --no-renames reports both sides as delete/add. NUL boundaries preserve
  // spaces/newlines; no API pagination limit or workflow path-filter truncation.
  const output = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      `${base}${separator}${head}`,
      "--",
    ],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  assert(output === "" || output.endsWith("\0"), "Incomplete git diff");
  return output === "" ? [] : output.slice(0, -1).split("\0");
}

export function selectChanges({ eventName, event, cwd, force = false }) {
  if (force || eventName === "workflow_dispatch") {
    return { selected: all(), reason: "Full verification requested" };
  }
  try {
    const paths = changedPaths(eventName, event, cwd);
    return {
      selected: classify(paths),
      reason: `${paths.length} changed paths (${eventName})`,
    };
  } catch (error) {
    return {
      selected: all(),
      reason: `Conservative fallback: ${error.message}`,
    };
  }
}

// An intentional skip is valid only after successful selection. Failed,
// cancelled, missing, and unexpectedly skipped work can never certify a change.
export function assertResults(needs, jobs) {
  assert(Object.keys(jobs).length > 0, "No verification jobs specified");
  assert.equal(
    needs.changes?.result,
    "success",
    "Change selection did not succeed"
  );
  for (const [group, job] of Object.entries(jobs)) {
    assert(
      groups.includes(group) && typeof job === "string",
      "Unknown verification job"
    );
    const selected = needs.changes.outputs?.[group];
    assert(
      ["true", "false"].includes(selected),
      `Missing selection for ${group}`
    );
    assert.equal(
      needs[job]?.result,
      selected === "true" ? "success" : "skipped",
      `${job} did not ${selected === "true" ? "succeed" : "skip intentionally"}`
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv[2] === "--verify") {
    assertResults(
      JSON.parse(process.env.CI_NEEDS),
      Object.fromEntries(process.argv.slice(3).map((entry) => entry.split("=")))
    );
  } else {
    let event;
    try {
      event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    } catch {
      // Missing/malformed events use the same conservative path as missing Git history.
      event = {};
    }
    const result = selectChanges({
      eventName: process.env.GITHUB_EVENT_NAME,
      event,
      cwd: process.cwd(),
      force: process.env.CI_FORCE_FULL === "true",
    });
    console.log(result.reason);
    console.log(JSON.stringify(result.selected, null, 2));
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(result.selected)
          .map(([key, value]) => `${key}=${value}\n`)
          .join("")
      );
    }
  }
}
