import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertResults,
  changedPaths,
  classify,
  groups,
  selectChanges,
} from "./ci-changes.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const selection = (...selected) =>
  Object.fromEntries(groups.map((group) => [group, selected.includes(group)]));
const full = selection(...groups);

for (const [name, paths, expected] of [
  ["editor component edit", ["editor/components/example.tsx"], []],
  ["API source edit", ["apps/api/server/routes/health.get.ts"], []],
  ["app manifests", ["editor/package.json", "apps/api/package.json"], []],
  [
    "app dependency update with shared lockfile",
    ["apps/api/package.json", "pnpm-lock.yaml"],
    ["conformance", "docs", "tooling"],
  ],
  ["AI SDK source", ["packages/grida-ai/src/index.ts"], ["conformance"]],
  ["shared auth source", ["packages/grida-auth/src/index.ts"], ["conformance"]],
  ["SDK dependencies", ["packages/grida-auth/package.json"], ["conformance"]],
  ["model catalogue", ["data/ai/facts.json"], ["conformance"]],
  [
    "Cargo dependencies",
    ["Cargo.lock"],
    ["rust", "conformance", "native", "docs"],
  ],
  [
    "Rust source",
    ["crates/grida-cli/src/main.rs"],
    ["rust", "conformance", "native", "docs"],
  ],
  [
    "Cargo build configuration",
    [".cargo/config.toml"],
    ["rust", "conformance", "native", "docs"],
  ],
  [
    "shared custody fixture",
    ["packages/grida-auth/fixtures/account-v1/custody.json"],
    ["rust", "conformance", "docs"],
  ],
  [
    "shared provider fixture",
    ["packages/grida-auth/fixtures/providers-v1/default.toml"],
    ["rust", "conformance", "docs"],
  ],
  [
    "consumed image fixture",
    ["fixtures/images/checker.png"],
    ["rust", "conformance", "docs"],
  ],
  [
    "native launcher",
    ["packages/grida-cli/native/bin.mjs"],
    ["conformance", "native", "docs", "tooling"],
  ],
  [
    "native delivery tooling",
    ["scripts/cli-release/native-build.mjs"],
    ["conformance", "native", "docs", "tooling"],
  ],
  [
    "installed native contract",
    ["scripts/cli-contracts/installed.mjs"],
    ["conformance", "native", "docs", "tooling"],
  ],
  ["CLI documentation", ["docs/cli/auth.md"], ["conformance", "docs"]],
  [
    "docs app dependencies",
    ["apps/docs/package.json"],
    ["conformance", "docs"],
  ],
  ["editor docs routing", ["editor/next.config.ts"], ["conformance", "docs"]],
  ["contract tooling", ["scripts/cli-contracts/checks.mjs"], ["conformance"]],
  ["Turbo shared config", ["turbo.json"], ["conformance"]],
  ["generated asset formatter", [".oxfmtrc.jsonc"], ["conformance"]],
  [
    "workspace install policy",
    ["pnpm-workspace.yaml"],
    ["conformance", "docs", "tooling"],
  ],
  ["publication tooling", ["scripts/publish-packages.mjs"], ["tooling"]],
  ["selector changes", [".github/scripts/ci-changes.mjs"], groups],
  ["workflow wiring", [".github/workflows/cli-verify.yml"], groups],
  ["unowned root configuration", ["new-build-config.json"], groups],
  ["unowned fixture", ["fixtures/new-contract.json"], groups],
  ["unowned script", ["scripts/new-build.mjs"], groups],
  ["empty change list", [], []],
]) {
  test(`selection: ${name}`, () => {
    assert.deepEqual(classify(paths), selection(...expected));
  });
}

test("unusable paths select every group conservatively", () => {
  for (const invalid of [
    "",
    null,
    123,
    "/editor/file",
    "../editor/file",
    "editor/../file",
    "./editor/file",
    "editor/\0file",
  ]) {
    assert.deepEqual(classify(["editor/example.tsx", invalid]), full);
  }
});

function repository(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "grida-ci-changes-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "CI selection test");
  git("config", "user.email", "ci-selection@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", path.join(cwd, "no-hooks"));
  const write = (file, contents = "test\n") => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), contents);
  };
  const commit = () => {
    git("add", "--all");
    git("commit", "--quiet", "-m", "test change");
    return git("rev-parse", "HEAD");
  };
  write("README.md");
  const initial = commit();
  return { cwd, git, write, commit, initial };
}

test("PR selection uses the cumulative merge-base diff; push uses its two endpoints", (t) => {
  const repo = repository(t);
  repo.git("checkout", "-b", "feature");
  repo.write("Cargo.toml");
  const nativeCommit = repo.commit();
  repo.write("editor/components/example.tsx");
  const head = repo.commit();
  repo.git("checkout", "main");
  repo.write("packages/grida-cli/native/main-only.mjs");
  const base = repo.commit();

  const event = { pull_request: { base: { sha: base }, head: { sha: head } } };
  assert.deepEqual(changedPaths("pull_request", event, repo.cwd), [
    "Cargo.toml",
    "editor/components/example.tsx",
  ]);
  assert.deepEqual(
    selectChanges({ eventName: "pull_request", event, cwd: repo.cwd }).selected,
    selection("rust", "conformance", "native", "docs")
  );
  const push = { before: nativeCommit, after: head };
  assert.deepEqual(changedPaths("push", push, repo.cwd), [
    "editor/components/example.tsx",
  ]);
  assert.deepEqual(
    selectChanges({ eventName: "push", event: push, cwd: repo.cwd }).selected,
    selection()
  );
});

test("renames and deletions retain sensitive old paths, including spaces and newlines", (t) => {
  const repo = repository(t);
  const oldPath = "crates/grida-cli/src/old source.rs";
  const fixture = "packages/grida-auth/fixtures/account-v1/deleted.json";
  const newPath = "editor/components/new source\nname.tsx";
  repo.write(oldPath);
  repo.write(fixture);
  const before = repo.commit();
  repo.write(newPath);
  renameSync(path.join(repo.cwd, oldPath), path.join(repo.cwd, newPath));
  rmSync(path.join(repo.cwd, fixture));
  const after = repo.commit();
  const changed = changedPaths("push", { before, after }, repo.cwd);
  assert.deepEqual(changed.sort(), [oldPath, fixture, newPath].sort());
  assert.deepEqual(
    classify(changed),
    selection("rust", "conformance", "native", "docs")
  );
});

test("deleted consumed fixture still selects Rust and contracts", (t) => {
  const repo = repository(t);
  const fixture = "fixtures/images/checker.png";
  repo.write(fixture);
  const before = repo.commit();
  rmSync(path.join(repo.cwd, fixture));
  const after = repo.commit();
  assert.deepEqual(
    selectChanges({
      eventName: "push",
      event: { before, after },
      cwd: repo.cwd,
    }).selected,
    selection("rust", "conformance", "docs")
  );
});

test("unavailable or invalid comparisons cannot become empty successful selections", (t) => {
  const repo = repository(t);
  for (const [eventName, event] of [
    ["pull_request", {}],
    ["pull_request", null],
    ["push", { before: "0".repeat(40), after: repo.initial }],
    ["push", { before: "f".repeat(40), after: repo.initial }],
    ["push", { before: "--output=unsafe", after: repo.initial }],
    ["push", { before: repo.initial, after: "invalid" }],
    ["unknown_event", {}],
  ]) {
    const result = selectChanges({ eventName, event, cwd: repo.cwd });
    assert.deepEqual(result.selected, full);
    assert.match(result.reason, /^Conservative fallback:/);
  }
});

test("manual and explicitly forced release calls select everything without Git history", () => {
  for (const options of [
    { eventName: "workflow_dispatch", event: {} },
    { eventName: "workflow_call", event: {}, force: true },
    { eventName: "pull_request", event: {}, force: true },
  ]) {
    const result = selectChanges({
      ...options,
      cwd: path.join(tmpdir(), "missing-ci-repository"),
    });
    assert.deepEqual(result.selected, full);
    assert.equal(result.reason, "Full verification requested");
  }
});

test("CLI treats malformed event files as uncertain inputs", (t) => {
  const repo = repository(t);
  const eventPath = path.join(repo.cwd, "event.json");
  const outputPath = path.join(repo.cwd, "outputs");
  writeFileSync(eventPath, "not JSON");
  execFileSync(
    process.execPath,
    [path.join(root, ".github/scripts/ci-changes.mjs")],
    {
      cwd: repo.cwd,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: outputPath,
        CI_FORCE_FULL: "false",
      },
    }
  );
  assert.equal(
    readFileSync(outputPath, "utf8"),
    groups.map((group) => `${group}=true\n`).join("")
  );
});

function results(selected = "true", result = "success") {
  return {
    changes: { result: "success", outputs: { native: selected } },
    delivery: { result },
  };
}

test("required gate accepts completed work and intentional skips", () => {
  assert.doesNotThrow(() => assertResults(results(), { native: "delivery" }));
  assert.doesNotThrow(() =>
    assertResults(results("false", "skipped"), { native: "delivery" })
  );
});

test("required gate rejects selected work that failed, cancelled, disappeared or skipped", () => {
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    const needs = results();
    needs.delivery.result = result;
    assert.throws(() => assertResults(needs, { native: "delivery" }));
  }
  const missingJob = results();
  delete missingJob.delivery;
  assert.throws(() => assertResults(missingJob, { native: "delivery" }));
});

test("required gate cannot turn failed selection or malformed outputs into a skip", () => {
  assert.throws(() => assertResults(results(), {}));
  assert.throws(() => assertResults(results(), { unknown: "delivery" }));
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    const needs = results("false", "skipped");
    needs.changes.result = result;
    assert.throws(() => assertResults(needs, { native: "delivery" }));
  }
  for (const value of [undefined, true, false, "", "unknown"]) {
    const needs = results("false", "skipped");
    needs.changes.outputs.native = value;
    assert.throws(() => assertResults(needs, { native: "delivery" }));
  }
  assert.throws(() =>
    assertResults({ delivery: { result: "skipped" } }, { native: "delivery" })
  );
});

test("unexpected execution, failure or cancellation is not an intentional skip", () => {
  for (const result of ["success", "failure", "cancelled", undefined]) {
    const needs = results("false", "skipped");
    needs.delivery.result = result;
    assert.throws(() => assertResults(needs, { native: "delivery" }));
  }
});

test("shared SDK workspace dependency closure is covered; no workspace consumer needs the CLI", () => {
  const workspaceText = readFileSync(
    path.join(root, "pnpm-workspace.yaml"),
    "utf8"
  );
  const packagePatterns = /^packages:\n((?:[ \t].*\n)+)/m.exec(
    workspaceText
  )?.[1];
  assert(packagePatterns, "Workspace package patterns must remain inspectable");
  const patterns = packagePatterns
    .trim()
    .split("\n")
    .map((line) => {
      const pattern = /^\s*- "([\w/*-]+)"$/.exec(line)?.[1];
      assert(
        pattern && !pattern.includes("**"),
        "New workspace glob syntax needs an updated dependency guard"
      );
      return new RegExp(`^${pattern.replaceAll("*", "[^/]+")}/package\\.json$`);
    });
  assert(patterns.length > 0);
  assert.equal(
    patterns.length,
    packagePatterns.match(/^\s+- /gm)?.length,
    "Every workspace pattern must be inspected"
  );
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--", "**/package.json"],
    { cwd: root, encoding: "utf8" }
  )
    .split("\0")
    .filter((file) => patterns.some((pattern) => pattern.test(file)));
  const manifests = new Map(
    files.map((file) => {
      const manifest = JSON.parse(readFileSync(path.join(root, file), "utf8"));
      return [manifest.name, { file, manifest }];
    })
  );
  assert(
    manifests.has("grida"),
    "The CLI name changed: revisit general CI exclusion"
  );
  const dependencies = (manifest) =>
    Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    });
  for (const { file, manifest } of manifests.values()) {
    assert(
      !dependencies(manifest).some(
        ([name, version]) =>
          name === "grida" || /^(?:workspace:|npm:)grida(?:@|$)/.test(version)
      ),
      `${file} requires the CLI: revisit general CI exclusion`
    );
  }
  const queue = [
    "@grida/ai",
    "@grida/ai-models",
    "@grida/auth",
    "@grida/account",
    "@grida/home",
  ];
  const checked = new Set();
  while (queue.length) {
    const name = queue.pop();
    if (checked.has(name)) continue;
    checked.add(name);
    const entry = manifests.get(name);
    assert(entry, `Missing shared SDK workspace ${name}`);
    assert.equal(
      classify([entry.file]).conformance,
      true,
      `${entry.file} must select its contract consumers`
    );
    for (const [dependency, version] of dependencies(entry.manifest)) {
      if (version.startsWith("workspace:"))
        assert(
          manifests.has(dependency),
          `Unresolved workspace dependency ${dependency}: update the dependency guard`
        );
      if (manifests.has(dependency)) queue.push(dependency);
    }
  }
});

test("auth infrastructure retains cross-product checks; Machine API remains unconditional", () => {
  const auth = readFileSync(
    path.join(root, ".github/workflows/auth-local.yml"),
    "utf8"
  );
  const triggers = auth.slice(0, auth.indexOf("\npermissions:"));
  const patterns = [...triggers.matchAll(/^      - "([^"]+)"$/gm)].map(
    ([, pattern]) => pattern
  );
  for (const [file, expected] of [
    ["editor/components/example.tsx", false],
    ["apps/api/server/routes/health.get.ts", false],
    ["editor/lib/auth/example.ts", true],
    ["editor/next.config.ts", true],
    ["editor/tsconfig.json", true],
    ["editor/package.json", true],
    ["pnpm-lock.yaml", true],
    ["turbo.json", true],
    [".npmrc", true],
    [".cargo/config.toml", true],
    ["crates/grida-ai/src/lib.rs", true],
  ]) {
    assert.equal(
      patterns.some((pattern) => path.matchesGlob(file, pattern)),
      expected,
      file
    );
  }
  const api = readFileSync(
    path.join(root, ".github/workflows/api.yml"),
    "utf8"
  );
  const apiTriggers = api.slice(0, api.indexOf("\npermissions:"));
  assert.match(apiTriggers, /\n  pull_request:\n/);
  assert.doesNotMatch(apiTriggers, /\bpaths(?:-ignore)?:/);
});

test("all general package CI Turbo tasks exclude the Cargo-backed CLI", () => {
  const workflow = readFileSync(
    path.join(root, ".github/workflows/test.yml"),
    "utf8"
  );
  for (const task of ["build", "typecheck", "test"]) {
    const command = new RegExp(
      `^\\s+run: pnpm turbo ${task}([^\\n]*)$`,
      "m"
    ).exec(workflow);
    assert(command, `Missing explicit general CI ${task} command`);
    assert.match(command[1], /--filter='!grida'/);
  }
  assert.match(
    workflow,
    /node --test \.github\/scripts\/ci-changes\.test\.mjs/
  );
});

test("workflow gates use selection, run even after failure, and default reusable calls to full verification", () => {
  for (const [file, jobs] of [
    ["rust.yml", { rust: "check", conformance: "conformance" }],
    ["cli-verify.yml", { native: "delivery", tooling: "tooling" }],
    ["cli-docs.yml", { docs: "docs" }],
  ]) {
    const workflow = readFileSync(
      path.join(root, ".github/workflows", file),
      "utf8"
    );
    const triggers = workflow.slice(0, workflow.indexOf("\npermissions:"));
    assert.doesNotMatch(triggers, /\bpaths(?:-ignore)?:/);
    assert.match(triggers, /force_full:\n(?: {8}.*\n)* {8}default: true/);
    assert.match(
      workflow,
      /force_full: \$\{\{ inputs\.force_full == true \|\| github\.event_name == 'workflow_dispatch' \}\}/
    );
    for (const [group, job] of Object.entries(jobs)) {
      assert.match(
        workflow,
        new RegExp(
          `\\n  ${job}:\\n    needs: changes\\n    if: needs\\.changes\\.outputs\\.${group} == 'true'`
        )
      );
    }
    const verifier = workflow.slice(workflow.indexOf("\n  verify:"));
    assert.match(verifier, /\n    if: always\(\)/);
    const needs = /needs: \[([^\]]+)\]/.exec(verifier)?.[1].split(", ");
    assert.deepEqual(needs, ["changes", ...Object.values(jobs)]);
    assert.match(verifier, /CI_NEEDS: \$\{\{ toJSON\(needs\) \}\}/);
    assert(
      verifier.includes(
        `--verify ${Object.entries(jobs)
          .map(([group, job]) => `${group}=${job}`)
          .join(" ")}`
      )
    );
  }
});
