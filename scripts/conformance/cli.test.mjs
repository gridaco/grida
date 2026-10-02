import assert from "node:assert/strict";
import { test } from "node:test";
import { assertResult, validateCases } from "./cli.mjs";
import { assertOperationVectors } from "./catalogue-vectors.mjs";
import { assertCheck } from "./checks.mjs";
import { assertInstalledStderr, startInstalledCommand } from "./installed.mjs";

test(
  "installed proof cleanup terminates the launcher and its pipe-holding child",
  { skip: process.platform === "win32", timeout: 7000 },
  async (t) => {
    const operation = startInstalledCommand(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import { spawn } from "node:child_process";
    spawn(process.execPath, ["-e", "process.stdout.write('ready'); setInterval(() => {}, 1000)"], { stdio: "inherit" });
    setInterval(() => {}, 1000);
  `,
      ],
      { env: {} }
    );
    t.after(() => operation.stop());
    await new Promise((resolve, reject) => {
      operation.child.stdout.once("data", resolve);
      operation.result.then(
        () => reject(new Error("Fixture exited before readiness")),
        reject
      );
    });
    await operation.stop();
    assert.equal((await operation.result).signal, "SIGKILL");
  }
);

test(
  "installed command timeouts stay observable after another proof step fails",
  { timeout: 7000 },
  async (t) => {
    const operation = startInstalledCommand(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { env: {} },
      50
    );
    t.after(() => operation.stop());
    // The timeout must not create an unhandled rejection while another proof
    // await owns control, nor may cleanup turn its failed result into success.
    await operation.closed;
    await operation.stop();
    await assert.rejects(operation.result, /Installed command timed out/);
  }
);

test("installed native proof rejects any stderr, including the old Node warning", () => {
  assertInstalledStderr({ stderr: "" });
  for (const stderr of [
    "debug secret\n",
    "(node:12345) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n" +
      "(Use `node --trace-warnings ...` to show where the warning was created)\n",
  ])
    assert.throws(() => assertInstalledStderr({ stderr }));
});

const example = {
  id: "selfcheck.json",
  argv: ["--json"],
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
  assert.throws(() => validateCases([]));
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

test("version checks bind the executable to its reviewed package", () => {
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
  const descriptors = [
    { kind: "image", provider_id: "fal", model_id: "sample", variant: "text" },
  ];
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
  assertOperationVectors(descriptors, [wire], inputs, faults);
  assert.throws(() => assertOperationVectors(descriptors, [], inputs, faults));
  assert.throws(() => assertOperationVectors([], [], inputs, faults));
  assert.throws(() =>
    assertOperationVectors(
      [...descriptors, ...descriptors],
      [wire],
      inputs,
      faults
    )
  );
  assert.throws(() =>
    assertOperationVectors(descriptors, [wire, wire], inputs, faults)
  );
  assert.throws(() =>
    assertOperationVectors(
      descriptors,
      [{ ...wire, transcript: [] }],
      inputs,
      faults
    )
  );
  assert.throws(() =>
    assertOperationVectors(descriptors, [wire], inputs.slice(0, 1), faults)
  );
  assert.throws(() =>
    assertOperationVectors(descriptors, [wire], inputs, faults.slice(1))
  );
});
