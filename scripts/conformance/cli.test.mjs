import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  realpath,
  readFile,
  writeFile,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { assertResult, validateCases } from "./cli.mjs";
import {
  bundleFingerprint,
  fingerprint,
  repository,
  verifyBundle,
} from "./baseline.mjs";
import {
  coverage,
  targetIncomplete,
  assertOperationVectors,
} from "./inventory.mjs";
import { assertCheck } from "./checks.mjs";

const example = {
  id: "selfcheck.json",
  argv: ["--json"],
  rust: "pending",
  expected: {
    exit: 2,
    stderr: "",
    stdout: { json: { error: { code: "invalid_usage", message: "safe" } } },
  },
};
const result = {
  status: 2,
  signal: null,
  stdout: '{"error":{"code":"invalid_usage","message":"safe"}}\n',
  stderr: "",
};

test("the runner accepts a matching result and rejects false-green observations", () => {
  validateCases([example]);
  assertResult(example, result);
  for (const mutation of [
    { status: 0 },
    { signal: "SIGTERM" },
    { stdout: "not implemented\n" },
    {
      stdout:
        '{"error":{"code":"invalid_usage","message":"safe"},"secret":"leak"}\n',
    },
    { stderr: "debug secret\n" },
    { error: new Error("spawn failed") },
  ])
    assert.throws(() => assertResult(example, { ...result, ...mutation }));
  assert.throws(() => validateCases([example, example]));
  assert.throws(() =>
    validateCases([
      {
        ...example,
        expected: { ...example.expected, stdout: { includes: [] } },
      },
    ])
  );
});

test("text/help checks reject empty or mismatched output", () => {
  const text = {
    ...example,
    expected: { ...example.expected, stdout: { text: "grida 0.2.0\n" } },
  };
  assert.throws(() => assertResult(text, result));
  const help = {
    ...example,
    expected: {
      ...example.expected,
      stdout: { includes: ["Usage:", "Documentation:"] },
    },
  };
  assert.throws(() => assertResult(help, { ...result, stdout: "Usage:\n" }));
  assertResult(help, {
    ...result,
    stdout: "Usage: grida\nDocumentation: url\n",
  });
});

test("version checks bind each implementation to its own reviewed package", () => {
  const versionCase = {
    ...example,
    argv: ["--version"],
    expected: { exit: 0, stdout: { version: true }, stderr: "" },
  };
  validateCases([versionCase]);
  const result = {
    status: 0,
    signal: null,
    stdout: "grida 0.3.0-rc.1\n",
    stderr: "",
  };
  assertResult(versionCase, result, "0.3.0-rc.1");
  assertResult(versionCase, { ...result, stdout: "grida 0.2.0\n" }, "0.2.0");
  assert.throws(() => assertResult(versionCase, result, "0.2.0"));
  assert.throws(() => assertResult(versionCase, result));
  assert.throws(() =>
    assertResult(
      versionCase,
      { ...result, stdout: "grida 0.3.0-rc.1\nextra\n" },
      "0.3.0-rc.1"
    )
  );
  assert.throws(() =>
    validateCases([
      {
        ...versionCase,
        expected: { ...versionCase.expected, stdout: { version: false } },
      },
    ])
  );
});

test("integration checks reject empty, skipped, or false-positive test runs", () => {
  assert.throws(() =>
    assertCheck({ assertion: "rust_tests" }, "test result: ok. 0 passed;")
  );
  assert.throws(() =>
    assertCheck({ assertion: "node_tests" }, "# tests 1\n# fail 0\n# skipped 1")
  );
  assert.throws(() =>
    assertCheck({ assertion: "json_proof" }, '{"passed":false}')
  );
  assertCheck({ assertion: "node_tests" }, "# tests 1\n# fail 0\n# skipped 0");
});

test("every advertised operation requires success, input refusal, failure and cancellation vectors", () => {
  const inventory = {
    operation_inventory: {
      operations: [{ id: "generate:image:fal:generation:sample:text" }],
    },
  };
  const wire = {
    id: "wire",
    selector: {
      kind: "image",
      provider: "fal",
      model_id: "sample",
      variant: "text",
    },
    transcript: [{}],
  };
  const inputs = [
    { id: "wire:valid", expected: { ok: true } },
    { id: "wire:invalid", expected: { ok: false } },
  ];
  const faults = [{ cancel: true }, { throw: true }, { status: 403 }].map(
    (fault) => ({ operation_id: "wire", fault })
  );
  assertOperationVectors(inventory, [wire], inputs, faults);
  assert.throws(() => assertOperationVectors(inventory, [], inputs, faults));
  assert.throws(() =>
    assertOperationVectors(inventory, [wire], inputs.slice(0, 1), faults)
  );
  assert.throws(() =>
    assertOperationVectors(inventory, [wire], inputs, faults.slice(1))
  );
});

test("the baseline digest detects edits, file additions, removals and renames", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "grida-baseline-test-"));
  try {
    await writeFile(path.join(root, "a"), "source");
    await writeFile(path.join(root, "b"), "source");
    const original = await fingerprint(["a"], root);
    assert.notEqual(await fingerprint(["b"], root), original);
    assert.notEqual(await fingerprint(["a", "b"], root), original);
    assert.notEqual(await fingerprint([], root), original);
    await writeFile(path.join(root, "a"), "changed");
    assert.notEqual(await fingerprint(["a"], root), original);
    await assert.rejects(fingerprint(["missing"], root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function bundleFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "grida-bundle-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifests = {
    "packages/cli": {
      name: "grida",
      bin: { grida: "./dist/bin.mjs" },
      devDependencies: { "@grida/ai": "workspace:*" },
    },
    "packages/ai": {
      name: "@grida/ai",
      main: "./dist/index.cjs",
      exports: {
        ".": {
          require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
        },
      },
      dependencies: { "@grida/ai-models": "workspace:*" },
    },
    "packages/models": { name: "@grida/ai-models", main: "./dist/index.js" },
  };
  const files = {
    "packages/cli/dist/bin.mjs": "export const cli = true;",
    "packages/ai/dist/index.cjs":
      "module.exports = require('./chunks/provider.cjs');",
    "packages/ai/dist/chunks/provider.cjs":
      "module.exports = require('@grida/ai-models');",
    "packages/models/dist/index.js":
      "module.exports = require('./catalogue.json');",
    "packages/models/dist/catalogue.json": '{"models":["example"]}',
  };
  for (const [filename, value] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await writeFile(path.join(root, filename), value);
  }
  for (const [directory, manifest] of Object.entries(manifests))
    await writeFile(
      path.join(root, directory, "package.json"),
      JSON.stringify(manifest)
    );
  const baseline = {
    paths: [...Object.keys(manifests), "package.json", "pnpm-lock.yaml"],
  };
  const record = { bundle_sha256: await bundleFingerprint(root, baseline) };
  return { root, baseline, record, files };
}

test("reference execution rejects tampered CJS chunks, local dependency outputs and runtime assets", async (t) => {
  const { root, baseline, record, files } = await bundleFixture(t);
  await verifyBundle(record, root, baseline);
  for (const [filename, original] of Object.entries(files)) {
    await writeFile(path.join(root, filename), `${original}\nchanged`);
    await assert.rejects(
      verifyBundle(record, root, baseline),
      /TypeScript bundle changed/
    );
    await writeFile(path.join(root, filename), original);
    await verifyBundle(record, root, baseline);
  }
  const chunk = "packages/ai/dist/chunks/provider.cjs";
  await rename(path.join(root, chunk), path.join(root, `${chunk}.renamed`));
  await assert.rejects(
    verifyBundle(record, root, baseline),
    /TypeScript bundle changed/
  );
  await rename(path.join(root, `${chunk}.renamed`), path.join(root, chunk));
  await rm(path.join(root, chunk));
  await assert.rejects(
    verifyBundle(record, root, baseline),
    /TypeScript bundle changed/
  );
  await writeFile(path.join(root, chunk), files[chunk]);
  const added = path.join(root, "packages/ai/dist/chunks/new.cjs");
  await writeFile(added, "module.exports = 'new runtime chunk';");
  await assert.rejects(
    verifyBundle(record, root, baseline),
    /TypeScript bundle changed/
  );
  await rm(added);
  await verifyBundle(record, root, baseline);
});

test("the bundle gate requires built runtime exports and the pinned workspace dependency closure", async (t) => {
  const { root, baseline, record, files } = await bundleFixture(t);
  await assert.rejects(
    bundleFingerprint(root, {
      paths: baseline.paths.filter((entry) => entry !== "packages/models"),
    }),
    /Unpinned workspace dependency/
  );
  const entry = path.join(root, "packages/ai/dist/index.cjs");
  await rm(entry);
  await assert.rejects(
    bundleFingerprint(root, baseline),
    /Build the pinned runtime entrypoint first/
  );
  await writeFile(entry, files["packages/ai/dist/index.cjs"]);
  const alias = path.join(root, "packages/ai/dist/alias.cjs");
  await symlink(entry, alias);
  await assert.rejects(bundleFingerprint(root, baseline), /only regular files/);
  await rm(alias);
  await verifyBundle(record, root, baseline);
});

test("pending operations and decisions keep the full target red after groups pass", () => {
  const complete = {
    id: "command.sample",
    required: true,
    status: "complete",
    cases: [example.id],
  };
  const inventory = {
    version: 1,
    contracts: [complete],
    operation_inventory: {
      operations: [
        {
          ...complete,
          id: "operation.sample",
          contract: complete.id,
          status: "pending",
          cases: [],
        },
      ],
    },
    divergences: [],
  };
  const cases = [{ ...example, contract: complete.id, rust: "complete" }];
  assert.equal(targetIncomplete(coverage(inventory, cases)), true);
  inventory.operation_inventory.operations[0].status = "complete";
  assert.throws(() => coverage(inventory, cases), /no evidence/);
  inventory.operation_inventory.operations[0].cases = [example.id];
  assert.equal(targetIncomplete(coverage(inventory, cases)), false);
  inventory.divergences.push({ status: "decision-required" });
  assert.equal(targetIncomplete(coverage(inventory, cases)), true);
  assert.throws(() => coverage(inventory, [example]), /Unknown contract/);
  inventory.contracts[0].cases = ["missing"];
  assert.throws(() => coverage(inventory, cases), /Unknown case/);
});

test("offline tripwires record even caught attempts to open a callback listener", async () => {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-guard-test-"))
  );
  try {
    for (const [source, name] of [
      ["scripts/cli-local/network.cjs", "network.cjs"],
      ["scripts/conformance/offline.cjs", "offline.cjs"],
    ])
      await cp(path.join(repository, source), path.join(root, name));
    const report = path.join(root, "network.json");
    const result = spawnSync(
      process.execPath,
      [
        "--require",
        path.join(root, "offline.cjs"),
        "-e",
        'try { require("node:net").createServer().listen(55435, "127.0.0.1"); } catch {}',
      ],
      {
        encoding: "utf8",
        timeout: 5000,
        env: {
          GRIDA_CLI_PROOF_ROOT: root,
          GRIDA_CLI_PROOF_REPORT: report,
          GRIDA_CLI_PROOF_OFFLINE: "1",
        },
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(report, "utf8")), {
      denied: 1,
      requests: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the TS JSONL driver preserves Unicode separators and bounds raw byte records", () => {
  const execute = (input) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        path.join(repository, "scripts/conformance/typescript.mjs"),
      ],
      { encoding: "utf8", input, timeout: 5000, maxBuffer: 2 * 1024 * 1024 }
    );
  const request = {
    argv: [
      "models",
      "inspect",
      "--provider",
      "fal",
      "--model",
      "test\u2028\u2029",
    ],
  };
  const result = execute(
    JSON.stringify(request) + '\r\n{"argv":["--version"]}'
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const responses = result.stdout
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(responses.length, 2);
  assert.equal(responses[0].invocation.model, "test\u2028\u2029");
  assert.equal(responses[1].invocation.command, "version");
  const full = '{"argv":[]}'.padEnd(1024 * 1024, " ");
  assert.equal(
    JSON.parse(execute(full + "\r\n").stdout).invocation.command,
    "help"
  );
  const oversized = execute(full + ' \n{"argv":[]}\n');
  assert.equal(oversized.status, 1);
  assert.equal(JSON.parse(oversized.stdout).error.code, "invalid_request");
  const invalidUtf8 = execute(Buffer.from([0xff, 10]));
  assert.equal(JSON.parse(invalidUtf8.stdout).error.code, "invalid_request");
});
